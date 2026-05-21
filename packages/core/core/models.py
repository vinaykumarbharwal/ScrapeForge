import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, Relationship, JSON, Column
from sqlalchemy import text

class User(SQLModel, table=True):
    __tablename__ = "users"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")}
    )
    email: str = Field(unique=True, index=True, nullable=False)
    password_hash: Optional[str] = Field(default=None)
    oauth_provider: Optional[str] = Field(default=None)
    oauth_id: Optional[str] = Field(default=None)
    plan: str = Field(default="free")
    api_key_hash: Optional[str] = Field(default=None)
    timezone: str = Field(default="UTC")
    created_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"server_default": text("now()")} )

    # Relationships
    scrape_tasks: List["ScrapeTask"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    templates: List["Template"] = Relationship(back_populates="user")
    notifications: List["Notification"] = Relationship(back_populates="user", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

class ScrapeTask(SQLModel, table=True):
    __tablename__ = "scrape_tasks"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")}
    )
    user_id: uuid.UUID = Field(foreign_key="users.id", nullable=False)
    name: str = Field(nullable=False)
    config: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    schedule_cron: Optional[str] = Field(default=None)
    status: str = Field(default="active")
    last_run_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"server_default": text("now()")} )

    # Relationships
    user: User = Relationship(back_populates="scrape_tasks")
    task_runs: List["TaskRun"] = Relationship(back_populates="task", sa_relationship_kwargs={"cascade": "all, delete-orphan"})
    schema_registries: List["SchemaRegistry"] = Relationship(back_populates="task", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

class TaskRun(SQLModel, table=True):
    __tablename__ = "task_runs"

    sa_column_kwargs = {}
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")}
    )
    task_id: uuid.UUID = Field(foreign_key="scrape_tasks.id", nullable=False)
    started_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"server_default": text("now()")} )
    finished_at: Optional[datetime] = Field(default=None)
    status: str = Field(default="running")
    rows_scraped: int = Field(default=0)
    pages_visited: int = Field(default=0)
    error_log: Optional[str] = Field(default=None)
    duration_ms: Optional[int] = Field(default=None)

    # Relationships
    task: ScrapeTask = Relationship(back_populates="task_runs")
    exports: List["Export"] = Relationship(back_populates="task_run", sa_relationship_kwargs={"cascade": "all, delete-orphan"})

class Template(SQLModel, table=True):
    __tablename__ = "templates"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")}
    )
    user_id: Optional[uuid.UUID] = Field(default=None, foreign_key="users.id")
    name: str = Field(nullable=False)
    description: Optional[str] = Field(default=None)
    selector_config: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    is_public: bool = Field(default=False)
    use_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"server_default": text("now()")} )

    # Relationships
    user: Optional[User] = Relationship(back_populates="templates")

class Export(SQLModel, table=True):
    __tablename__ = "exports"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True, sa_column_kwargs={"server_default": text("gen_random_uuid()")}
    )
    task_run_id: uuid.UUID = Field(foreign_key="task_runs.id", nullable=False)
    format: str = Field(nullable=False)
    file_url: Optional[str] = Field(default=None)
    file_size_bytes: Optional[int] = Field(default=None)
    status: str = Field(default="pending")
    created_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"server_default": text("now()")} )

    # Relationships
    sa_column_kwargs = {}
    task_run: TaskRun = Relationship(back_populates="exports")

class SchemaRegistry(SQLModel, table=True):
    __tablename__ = "schema_registry"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")}
    )
    task_id: uuid.UUID = Field(foreign_key="scrape_tasks.id", nullable=False)
    version: int = Field(nullable=False)
    columns: List[Dict[str, Any]] = Field(default_factory=list, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow, sa_column_kwargs={"server_default": text("now()")} )

    # Relationships
    task: ScrapeTask = Relationship(back_populates="schema_registries")

class Notification(SQLModel, table=True):
    __tablename__ = "notifications"

    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        primary_key=True,
        index=True,
        sa_column_kwargs={"server_default": text("gen_random_uuid()")}
    )
    user_id: uuid.UUID = Field(foreign_key="users.id", nullable=False)
    event_type: str = Field(nullable=False)
    channel: str = Field(nullable=False)
    config: Dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
    is_active: bool = Field(default=True)

    # Relationships
    user: User = Relationship(back_populates="notifications")
