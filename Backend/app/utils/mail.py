"""
Transactional email (verification codes, password reset PINs).

Provider order:
  1. SMTP    if SMTP_HOST is set (Gmail, Zoho, Brevo, any SMTP server)
  2. Resend  if RESEND_API_KEY is set
  3. Mock    otherwise: the email is printed and appended to mock_emails.txt (local dev only)

SMTP settings (.env / Azure App Settings):
  SMTP_HOST       e.g. smtp.gmail.com
  SMTP_PORT       587 (STARTTLS) or 465 (SSL). Default 587.
  SMTP_USER       login, usually the full email address
  SMTP_PASSWORD   for Gmail this must be an App Password, not your normal password
  SMTP_FROM       sender shown to users, e.g. "Auvon AI <you@gmail.com>" (defaults to SMTP_USER)
"""

import html
import os
import secrets
import smtplib
import ssl
import string
import logging
from email.message import EmailMessage
from email.utils import formataddr, parseaddr

import requests
from fastapi import BackgroundTasks
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

MOCK_EMAIL_FILE = "mock_emails.txt"


def generate_otp() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(6))


def email_configured() -> bool:
    """True when a real provider (SMTP or Resend) can deliver email."""
    return bool(os.getenv("SMTP_HOST") or os.getenv("RESEND_API_KEY"))


def _write_mock(to_email: str, subject: str, html_content: str, note: str = "") -> None:
    mock_msg = (
        f"========================================\n"
        f"MOCK EMAIL{(' (' + note + ')') if note else ''} TO: {to_email}\n"
        f"SUBJECT: {subject}\n"
        f"CONTENT:\n{html_content}\n"
        f"========================================\n"
    )
    print(mock_msg)
    try:
        with open(MOCK_EMAIL_FILE, "a", encoding="utf-8") as f:
            f.write(mock_msg)
    except Exception as e:
        logger.error(f"Failed to write mock email: {e}")


def _send_smtp(to_email: str, subject: str, html_content: str) -> None:
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT") or 587)
    user = os.getenv("SMTP_USER") or ""
    password = os.getenv("SMTP_PASSWORD") or ""
    sender = os.getenv("SMTP_FROM") or user
    name, addr = parseaddr(sender)

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((name or "Auvon AI", addr or user))
    msg["To"] = to_email
    msg.set_content("Please open this email in an HTML-capable email client.")
    msg.add_alternative(html_content, subtype="html")

    context = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=context, timeout=20) as server:
            if user:
                server.login(user, password)
            server.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=20) as server:
            server.starttls(context=context)
            if user:
                server.login(user, password)
            server.send_message(msg)


def _send_resend(to_email: str, subject: str, html_content: str) -> None:
    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {os.getenv('RESEND_API_KEY')}",
            "Content-Type": "application/json",
        },
        json={
            "from": os.getenv("RESEND_FROM") or "Auvon AI <onboarding@resend.dev>",
            "to": [to_email],
            "subject": subject,
            "html": html_content,
        },
        timeout=30,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Resend {response.status_code}: {response.text[:300]}")


def send_email_sync(to_email: str, subject: str, html_content: str) -> bool:
    """Send one email. Returns True if a real provider accepted it."""
    load_dotenv()  # real environment variables (Azure App Settings) always win over .env
    try:
        if os.getenv("SMTP_HOST"):
            _send_smtp(to_email, subject, html_content)
            provider = "smtp"
        elif os.getenv("RESEND_API_KEY"):
            _send_resend(to_email, subject, html_content)
            provider = "resend"
        else:
            _write_mock(to_email, subject, html_content)
            return False
        logger.info(f"Email sent to {to_email} via {provider}")
        return True
    except Exception as e:
        # Never put the code itself in logs; only that sending failed.
        logger.error(f"Failed to send email to {to_email}: {type(e).__name__}: {e}")
        if not os.getenv("SMTP_HOST") and not os.getenv("RESEND_API_KEY"):
            _write_mock(to_email, subject, html_content, note=f"error: {e}")
        return False


def _code_email(name: str, intro: str, code: str, outro: str) -> str:
    safe_name = html.escape(name or "there")
    return f"""
    <html>
      <body style="margin:0; padding:24px; background:#f4f6f5; font-family:Arial, Helvetica, sans-serif; color:#1f2a24;">
        <div style="max-width:520px; margin:0 auto; background:#ffffff; border:1px solid #e3e8e5; border-radius:14px; padding:32px;">
          <p style="margin:0 0 20px; font-size:18px; font-weight:bold;">Auvon <span style="color:#2f7a52;">ai</span></p>
          <p style="margin:0 0 12px;">Hi {safe_name},</p>
          <p style="margin:0 0 24px; line-height:1.5;">{intro}</p>
          <div style="text-align:center; margin:0 0 24px;">
            <span style="display:inline-block; font-size:32px; font-weight:bold; letter-spacing:8px; color:#2f7a52;
                         background:#eef5f1; border:1px solid #cfe3d7; border-radius:10px; padding:12px 22px;">{code}</span>
          </div>
          <p style="margin:0 0 8px; line-height:1.5;">This code expires in 15 minutes.</p>
          <p style="margin:0; line-height:1.5; color:#5b6b62;">{outro}</p>
          <hr style="border:none; border-top:1px solid #e3e8e5; margin:28px 0 16px;" />
          <p style="margin:0; font-size:12px; color:#8a978f; text-align:center;">Auvon ai · your study companion</p>
        </div>
      </body>
    </html>
    """


def send_verification_email(background_tasks: BackgroundTasks, to_email: str, name: str, code: str):
    html_content = _code_email(
        name,
        "Welcome to Auvon ai. Use this code to confirm your email address:",
        code,
        "If you didn't create an account, you can ignore this email.",
    )
    background_tasks.add_task(send_email_sync, to_email, "Your Auvon ai verification code", html_content)


def send_password_reset_email(background_tasks: BackgroundTasks, to_email: str, name: str, pin: str):
    html_content = _code_email(
        name,
        "We got a request to reset your Auvon ai password. Enter this PIN on the reset page:",
        pin,
        "If you didn't ask to reset your password, ignore this email. Your password stays the same.",
    )
    background_tasks.add_task(send_email_sync, to_email, "Your Auvon ai password reset PIN", html_content)
