from bs4 import BeautifulSoup
from typing import List, Dict, Any, Optional
from core.schemas import SelectorField

class FieldExtractor:
    def __init__(self, html_content: str):
        self.soup = BeautifulSoup(html_content, "lxml")

    def extract_field_value(self, element: Any, field: SelectorField) -> Optional[str]:
        # Find element using selector relative to parent node
        target = element.select_one(field.selector)
        if not target:
            return None

        if field.type == 'text':
            return target.get_text(strip=True)
        elif field.type == 'attr':
            if not field.attr:
                return None
            val = target.get(field.attr)
            if isinstance(val, list):
                return " ".join(val)
            return val
        elif field.type == 'html':
            return str(target)
        
        return None

    def extract_list(self, fields: List[SelectorField], container_selector: Optional[str] = None) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []

        if container_selector:
            # 1. Container-based extraction (premium SaaS-grade approach)
            # Find all container blocks (e.g., card nodes, table rows)
            containers = self.soup.select(container_selector)
            for item in containers:
                row = {}
                for field in fields:
                    row[field.name] = self.extract_field_value(item, field)
                # Keep row if at least one field has non-None value
                if any(val is not None for val in row.values()):
                    results.append(row)
        else:
            # 2. Global extraction & zipping (fallback approach)
            # Extract matches for all fields globally and align by index
            field_matches: Dict[str, List[Optional[str]]] = {}
            max_len = 0
            
            for field in fields:
                elements = self.soup.select(field.selector)
                max_len = max(max_len, len(elements))
                
                vals = []
                for el in elements:
                    if field.type == 'text':
                        vals.append(el.get_text(strip=True))
                    elif field.type == 'attr' and field.attr:
                        val = el.get(field.attr)
                        vals.append(" ".join(val) if isinstance(val, list) else val)
                    elif field.type == 'html':
                        vals.append(str(el))
                    else:
                        vals.append(None)
                field_matches[field.name] = vals

            # Zip rows together
            for i in range(max_len):
                row = {}
                for field in fields:
                    vals = field_matches[field.name]
                    row[field.name] = vals[i] if i < len(vals) else None
                results.append(row)

        return results
