import os
from email.message import EmailMessage
import aiosmtplib

SMTP_HOST = os.environ.get("SMTP_HOST", "localhost")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "1025"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "alerts@scrapeforge.com")

async def send_failure_email(to_email: str, task_name: str, error_log: str):
    msg = EmailMessage()
    msg["Subject"] = f"⚠️ ScrapeForge Alert: Scraper '{task_name}' Failed"
    msg["From"] = SMTP_FROM
    msg["To"] = to_email
    
    content = f"""
    Hello,
    
    This is an automated alert from ScrapeForge.
    
    Your scraping task '{task_name}' failed to execute successfully.
    
    Error Summary:
    --------------------------------------------------
    {error_log}
    --------------------------------------------------
    
    Please sign into your console dashboard at http://localhost:5173 to review the full execution logs and update your selector mapping.
    
    Best regards,
    ScrapeForge Team
    """
    msg.set_content(content)
    
    try:
        kwargs = {}
        if SMTP_USER and SMTP_PASSWORD:
            kwargs["username"] = SMTP_USER
            kwargs["password"] = SMTP_PASSWORD
            
        # Standard connection using aiosmtplib
        await aiosmtplib.send(
            msg,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            use_tls=SMTP_PORT == 465,
            start_tls=SMTP_PORT == 587,
            **kwargs
        )
        print(f"Alert email sent successfully to {to_email} for task '{task_name}'")
    except Exception as e:
        print(f"Failed to dispatch failure email alert to {to_email}: {e}")
