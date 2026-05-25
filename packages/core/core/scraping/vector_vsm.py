import math
import re
from typing import List, Dict, Tuple

STOP_WORDS = {
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at',
    'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by', 'cant', 'cannot', 'could',
    'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during', 'each', 'few', 'for', 'from', 'further',
    'had', 'hadnt', 'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here', 'heres',
    'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is',
    'isnt', 'it', 'its', 'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not', 'of',
    'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same',
    'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such', 'than', 'that', 'thats',
    'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these', 'they', 'theyd', 'theyll',
    'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasnt',
    'we', 'wed', 'well', 'were', 'weve', 'werent', 'what', 'whats', 'when', 'whens', 'where', 'wheres', 'which',
    'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt', 'you', 'youd', 'youll',
    'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves'
}

def tokenize(text: str) -> List[str]:
    """Helper to tokenize, clean, and lowercase strings."""
    if not text:
        return []
    words = re.findall(r'[a-zA-Z0-9_]+', text.lower())
    return [w for w in words if w not in STOP_WORDS]

class VectorSpaceModel:
    """A pure-Python TF-IDF Vector Space Model for semantic text mapping and similarity."""
    
    def __init__(self, corpus: List[str]):
        self.doc_count = len(corpus)
        self.df: Dict[str, int] = {}
        self.vocab = set()
        
        # Calculate Document Frequency (DF)
        for doc in corpus:
            tokens = set(tokenize(doc))
            for t in tokens:
                self.df[t] = self.df.get(t, 0) + 1
                self.vocab.add(t)
                
    def get_tfidf_vector(self, text: str) -> Dict[str, float]:
        """Generate TF-IDF weight vector for a given text."""
        tokens = tokenize(text)
        tf: Dict[str, int] = {}
        for t in tokens:
            tf[t] = tf.get(t, 0) + 1
            
        vector: Dict[str, float] = {}
        for term, count in tf.items():
            if term in self.vocab:
                # TF: Term frequency scaling
                tf_val = 1 + math.log(count) if count > 0 else 0
                # IDF: Inverse Document Frequency
                df_val = self.df.get(term, 1)
                idf_val = math.log((1 + self.doc_count) / (1 + df_val)) + 1
                vector[term] = tf_val * idf_val
        return vector

def cosine_similarity(v1: Dict[str, float], v2: Dict[str, float]) -> float:
    """Calculate the cosine similarity between two sparse weight vectors."""
    if not v1 or not v2:
        return 0.0
        
    # Dot Product
    dot_product = 0.0
    for term, val in v1.items():
        if term in v2:
            dot_product += val * v2[term]
            
    # Vector Norms (magnitudes)
    norm1 = math.sqrt(sum(val ** 2 for val in v1.values()))
    norm2 = math.sqrt(sum(val ** 2 for val in v2.values()))
    
    if norm1 == 0.0 or norm2 == 0.0:
        return 0.0
        
    return dot_product / (norm1 * norm2)

def match_elements(prompt: str, elements: List[Dict], limit: int = 5) -> List[Tuple[Dict, float]]:
    """
    Evaluates DOM elements and ranks them against a semantic prompt (e.g. 'book price')
    using Cosine Similarity on TF-IDF vectors of text, class names, and selectors.
    """
    # 1. Build a mini VSM corpus using elements text and metadata
    corpus = []
    for el in elements:
        text = el.get("text", "")
        selector = el.get("selector", "")
        tag = el.get("tagName", "")
        # Create a document composed of text, selectors and metadata attributes
        doc = f"{text} {selector.replace('.', ' ').replace('#', ' ')} {tag}"
        corpus.append(doc)
        
    vsm = VectorSpaceModel(corpus)
    prompt_vector = vsm.get_tfidf_vector(prompt)
    
    ranked_elements = []
    for idx, el in enumerate(elements):
        doc = corpus[idx]
        doc_vector = vsm.get_tfidf_vector(doc)
        
        # Calculate cosine similarity score
        score = cosine_similarity(prompt_vector, doc_vector)
        
        # Boost specific common semantic selectors (e.g. price inputs, lists)
        tag = el.get("tagName", "").lower()
        if "price" in prompt.lower() and ("price" in el.get("text", "").lower() or "price" in el.get("selector", "").lower()):
            score += 0.2
        if "title" in prompt.lower() and ("title" in el.get("text", "").lower() or "title" in el.get("selector", "").lower() or tag in ("h1", "h2", "h3")):
            score += 0.15
            
        if score > 0.0:
            ranked_elements.append((el, score))
            
    # Sort descending by score
    ranked_elements.sort(key=lambda x: x[1], reverse=True)
    return ranked_elements[:limit]
