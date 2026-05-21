from typing import List, Dict, Any, Tuple
import uuid
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy import text
from core.schemas import ColumnSchema, SchemaDiff
from core.models import SchemaRegistry

class SchemaDiffer:
    def is_widening(self, old_type: str, new_type: str) -> bool:
        # Simplistic type widening rules:
        # BIGINT -> NUMERIC is allowed. BOOLEAN/INTEGER -> TEXT is allowed.
        # Otherwise, changes are marked as potential narrowing or requires review.
        widening_rules = {
            "BIGINT": ["NUMERIC(14,4)", "TEXT"],
            "NUMERIC(3,1)": ["NUMERIC(14,4)", "TEXT"],
            "NUMERIC(14,4)": ["TEXT"],
            "BOOLEAN": ["TEXT"],
            "TIMESTAMPTZ": ["TEXT"]
        }
        if old_type == new_type:
            return True
        return new_type in widening_rules.get(old_type, [])

    def diff(self, current: List[ColumnSchema], incoming: List[ColumnSchema]) -> SchemaDiff:
        current_map = {c.name: c for c in current}
        incoming_map = {c.name: c for c in incoming}

        added = [c for c in incoming if c.name not in current_map]
        removed = [c for c in current if c.name not in incoming_map]
        
        type_changed = []
        type_narrowed = []

        for c in incoming:
            if c.name in current_map:
                old = current_map[c.name]
                if old.pg_type != c.pg_type:
                    if self.is_widening(old.pg_type, c.pg_type):
                        type_changed.append(c)
                    else:
                        type_narrowed.append(c)

        return SchemaDiff(
            isNewTable=len(current) == 0,
            added=added,
            removed=removed,
            typeChanged=type_changed,
            typeNarrowed=type_narrowed,
            newColumns=incoming
        )

class MigrationRunner:
    def __init__(self, conn: AsyncConnection):
        self.conn = conn

    def get_table_name(self, task_id: uuid.UUID) -> str:
        return f"scrape_data__{str(task_id).replace('-', '_')}"

    async def table_exists(self, table_name: str) -> bool:
        query = text(
            "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = :table_name);"
        )
        result = await self.conn.execute(query, {"table_name": table_name})
        return result.scalar()

    async def get_current_columns(self, table_name: str) -> List[ColumnSchema]:
        query = text(
            "SELECT column_name, data_type, is_nullable "
            "FROM information_schema.columns "
            "WHERE table_name = :table_name;"
        )
        result = await self.conn.execute(query, {"table_name": table_name})
        columns = []
        for row in result.all():
            name = row[0]
            data_type = row[1]
            is_nullable = row[2] == 'YES'
            
            # Map standard information_schema data types to Postgres creation syntax
            pg_type = "TEXT"
            if data_type.upper() in ("BIGINT", "INTEGER"):
                pg_type = "BIGINT"
            elif data_type.upper() in ("NUMERIC", "DOUBLE PRECISION"):
                pg_type = "NUMERIC(14,4)"
            elif "TIME" in data_type.upper():
                pg_type = "TIMESTAMPTZ"
            elif "BOOLEAN" in data_type.upper():
                pg_type = "BOOLEAN"
            elif "JSON" in data_type.upper():
                pg_type = "JSONB"
            
            # We ignore metadata columns
            if name not in ("id", "run_id", "scraped_at"):
                columns.append(ColumnSchema(name=name, pg_type=pg_type, nullable=is_nullable))
        return columns

    async def apply(self, task_id: uuid.UUID, diff: SchemaDiff, run_id: uuid.UUID) -> List[str]:
        """
        Applies safe migrations dynamically.
        Returns a list of warning messages for skipped unsafe actions (e.g. type narrowing).
        """
        table = self.get_table_name(task_id)
        warnings: List[str] = []

        # 1. Enforce safety check: Narrowing types is blocked automatically
        for col in diff.typeNarrowed:
            msg = f"Blocked type narrowing on column '{col.name}' (conversion to {col.pg_type} skipped to prevent potential data cast failures)."
            warnings.append(msg)
            print(f"Migration warning: {msg}")
            
        if diff.isNewTable:
            # Create a completely new table
            col_definitions = []
            for col in diff.added:
                col_definitions.append(f"{col.name} {col.pg_type}")
            
            ddl = f"""
            CREATE TABLE {table} (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                run_id UUID NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
                scraped_at TIMESTAMPTZ DEFAULT now(),
                {", ".join(col_definitions)}
            );
            """
            await self.conn.execute(text(ddl))
            return warnings

        # Add new columns
        for col in diff.added:
            ddl = f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col.name} {col.pg_type};"
            await self.conn.execute(text(ddl))

        # Apply widened types
        for col in diff.typeChanged:
            ddl = f"ALTER TABLE {table} ALTER COLUMN {col.name} TYPE {col.pg_type} USING {col.name}::{col.pg_type};"
            await self.conn.execute(text(ddl))

        # Soft delete: drop NOT NULL constraints rather than dropping columns, preventing historical data loss
        for col in diff.removed:
            ddl = f"ALTER TABLE {table} ALTER COLUMN {col.name} DROP NOT NULL;"
            await self.conn.execute(text(ddl))

        return warnings
