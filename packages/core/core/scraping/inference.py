import re
from typing import List, Dict, Any
from core.schemas import InferredType

# Regex patterns for matching common types
ISO_DATE_REGEX = re.compile(
    r"^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$"
)
CURRENCY_REGEX = re.compile(
    r"^[$€£¥₹]?\s*[\d,]+\.?\d*\s*(?:USD|EUR|GBP|JPY|INR)?$", re.IGNORECASE
)
DECIMAL_REGEX = re.compile(r"^-?\d+\.\d+$")
INTEGER_REGEX = re.compile(r"^-?\d+$")
BOOLEAN_REGEX = re.compile(r"^(yes|no|true|false|1|0|y|n)$", re.IGNORECASE)
JSON_REGEX = re.compile(r"^(\{.*\}|\[.*\])$")
URL_REGEX = re.compile(r"^https?://[^\s/$.?#].[^\s]*$", re.IGNORECASE)
EMAIL_REGEX = re.compile(r"^[\w.+%-]+@[\w.-]+\.[a-zA-Z]{2,}$")

def clean_and_test_price(val: str) -> bool:
    # Remove currency symbols and commas to check if value represents a decimal price
    cleaned = re.sub(r"[$,€,£,¥,₹,a-zA-Z,\s]", "", val)
    if not cleaned:
        return False
    try:
        float(cleaned)
        return True
    except ValueError:
        return False

def infer_type(samples: List[str]) -> InferredType:
    if not samples:
        return InferredType(type="text", pg="TEXT", confidence=0.50)
    
    # Strip nulls/empties from evaluation
    valid_samples = [s.strip() for s in samples if s is not None and str(s).strip() != ""]
    if not valid_samples:
        return InferredType(type="text", pg="TEXT", confidence=0.50)
        
    scores = {
        "url": 0.0,
        "email": 0.0,
        "date": 0.0,
        "price": 0.0,
        "decimal": 0.0,
        "integer": 0.0,
        "boolean": 0.0,
        "json": 0.0,
        "text": 0.0
    }
    
    total = len(valid_samples)
    
    for s in valid_samples:
        # Check patterns
        if URL_REGEX.match(s):
            scores["url"] += 1
        if EMAIL_REGEX.match(s):
            scores["email"] += 1
        if ISO_DATE_REGEX.match(s):
            scores["date"] += 1
        if BOOLEAN_REGEX.match(s):
            scores["boolean"] += 1
        if JSON_REGEX.match(s):
            scores["json"] += 1
        if INTEGER_REGEX.match(s):
            scores["integer"] += 1
        elif DECIMAL_REGEX.match(s):
            scores["decimal"] += 1
            
        # Currency/price edge case
        if CURRENCY_REGEX.match(s) or clean_and_test_price(s):
            scores["price"] += 1
            
        # Text is the fallback for everything
        scores["text"] += 0.5
        
    # Apply confidence penalties & weights
    results = [
        InferredType(type="url", pg="TEXT", confidence=(scores["url"] / total) * 0.99),
        InferredType(type="email", pg="TEXT", confidence=(scores["email"] / total) * 0.98),
        InferredType(type="date", pg="TIMESTAMPTZ", confidence=(scores["date"] / total) * 0.95),
        # Price matches are often decimals
        InferredType(type="price", pg="NUMERIC(14,4)", confidence=(scores["price"] / total) * 0.92),
        InferredType(type="decimal", pg="NUMERIC(14,4)", confidence=(scores["decimal"] / total) * 0.88),
        InferredType(type="integer", pg="BIGINT", confidence=(scores["integer"] / total) * 0.85),
        InferredType(type="boolean", pg="BOOLEAN", confidence=(scores["boolean"] / total) * 0.80),
        InferredType(type="json", pg="JSONB", confidence=(scores["json"] / total) * 0.75),
        # Default fallback
        InferredType(type="text", pg="TEXT", confidence=(scores["text"] / total) * 0.50)
    ]
    
    # Sort results by confidence descending
    results.sort(key=lambda x: x.confidence, reverse=True)
    return results[0]
