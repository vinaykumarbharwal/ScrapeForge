from urllib.parse import urlparse
import socket
import ipaddress

def is_safe_url(url: str) -> bool:
    """
    Prevents SSRF (Server-Side Request Forgery) attacks by verifying that 
    the resolved hostname ip address is not in private or reserved IP space.
    """
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
            
        hostname = parsed.hostname
        if not hostname:
            return False
            
        # Handle localhost/loopback directly
        if hostname.lower() in ("localhost", "127.0.0.1", "::1"):
            return False
            
        # Resolve hostname to IP address
        ip_addr = socket.gethostbyname(hostname)
        ip = ipaddress.ip_address(ip_addr)
        
        # Check against private / reserved ranges
        if (ip.is_private or 
            ip.is_loopback or 
            ip.is_link_local or 
            ip.is_reserved or 
            ip.is_multicast or 
            ip.is_unspecified):
            return False
            
        return True
    except Exception:
        return False
