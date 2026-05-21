from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field, HttpUrl

PlanType = Literal['free', 'pro', 'team']
TaskStatus = Literal['active', 'paused', 'archived']
RunStatus = Literal['running', 'success', 'failed', 'cancelled']
ExportFormat = Literal['csv', 'json', 'xlsx']
ExportStatus = Literal['pending', 'success', 'failed']
NotificationChannel = Literal['email', 'webhook', 'slack']

class SelectorField(BaseModel):
    name: str = Field(..., pattern=r"^[a-zA-Z_][a-zA-Z0-9_]*$")
    selector: str
    type: Literal['text', 'attr', 'html']
    attr: Optional[str] = None

class PaginationConfig(BaseModel):
    type: Literal['next_button', 'url_pattern', 'infinite_scroll']
    selector: Optional[str] = None
    urlTemplate: Optional[str] = None
    maxPages: int = Field(default=1, gt=0, le=100)

class TaskConfig(BaseModel):
    taskId: str
    startUrl: str
    pagination: PaginationConfig
    fields: List[SelectorField]
    rateLimitMs: Optional[int] = 0
    useProxy: Optional[bool] = False

class ColumnSchema(BaseModel):
    name: str
    pg_type: str
    nullable: bool
    samples: Optional[List[str]] = None

class RawField(BaseModel):
    rawName: str
    samples: List[str]
    tagPath: Optional[str] = None
    attrs: Optional[Dict[str, str]] = None

class InferredType(BaseModel):
    type: str
    pg: str
    confidence: float

class SchemaDiff(BaseModel):
    isNewTable: bool
    added: List[ColumnSchema]
    removed: List[ColumnSchema]
    typeChanged: List[ColumnSchema]
    typeNarrowed: List[ColumnSchema]
    newColumns: List[ColumnSchema]

class ScraperResult(BaseModel):
    rowCount: int
    pageCount: int
    status: RunStatus
    error: Optional[str] = None

class ScraperEvent(BaseModel):
    type: Literal['run_success', 'run_failed', 'run_slow', 'schema_changed', 'schema_warning', 'quota_near_limit']
    taskId: str
    runId: str
    message: str
    timestamp: str
    metadata: Optional[Dict[str, Any]] = None
