import smtplib
import os
import secrets
import string
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from fastapi import BackgroundTasks
import logging
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

MOCK_EMAIL_FILE = "mock_emails.txt"

def generate_otp() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(6))

def send_email_sync(to_email: str, subject: str, html_content: str):
    load_dotenv(override=True)
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = os.getenv("SMTP_PORT")
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_sender = os.getenv("SMTP_SENDER") or smtp_user
    smtp_use_tls = os.getenv("SMTP_TLS", "True").lower() in ("true", "1", "yes")

    # If any configuration is missing, use mock file
    if not all([smtp_host, smtp_port, smtp_user, smtp_password]):
        mock_msg = (
            f"========================================\n"
            f"MOCK EMAIL SENT TO: {to_email}\n"
            f"SUBJECT: {subject}\n"
            f"CONTENT:\n{html_content}\n"
            f"========================================\n"
        )
        print(mock_msg)
        # Write to mock file for easy retrieval
        try:
            with open(MOCK_EMAIL_FILE, "a", encoding="utf-8") as f:
                f.write(mock_msg)
        except Exception as e:
            logger.error(f"Failed to write mock email: {e}")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_sender
        msg["To"] = to_email

        part = MIMEText(html_content, "html")
        msg.attach(part)

        # Connect
        port = int(smtp_port)
        if port == 465:
            # SSL
            server = smtplib.SMTP_SSL(smtp_host, port)
        else:
            # TLS or plain
            server = smtplib.SMTP(smtp_host, port)
            if smtp_use_tls:
                server.starttls()
        
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_sender, [to_email], msg.as_string())
        server.quit()
        logger.info(f"Email successfully sent to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        # Fallback to mock file
        mock_msg = (
            f"=== FALLBACK MOCK EMAIL (ERROR: {e}) ===\n"
            f"TO: {to_email}\n"
            f"SUBJECT: {subject}\n"
            f"CONTENT:\n{html_content}\n"
            f"========================================\n"
        )
        print(mock_msg)
        try:
            with open(MOCK_EMAIL_FILE, "a", encoding="utf-8") as f:
                f.write(mock_msg)
        except Exception as err:
            logger.error(f"Failed to write mock email: {err}")

def send_verification_email(background_tasks: BackgroundTasks, to_email: str, name: str, code: str):
    subject = "Verify Your Auvon.AI Account"
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; background-color: #0f0f13; color: #ffffff; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #1a1a24; padding: 30px; border-radius: 12px; border: 1px solid #2d2d3d;">
                <h1 style="color: #8b5cf6; text-align: center;">Auvon.AI ✨</h1>
                <p>Hello {name},</p>
                <p>Thank you for registering on Auvon.AI. Please use the following 6-digit verification code to confirm your email address:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #8b5cf6; padding: 10px 20px; background-color: #0f0f13; border-radius: 8px; border: 1px solid #3c3c52;">{code}</span>
                </div>
                <p>This code will expire in 15 minutes.</p>
                <p>If you did not sign up for Auvon.AI, you can ignore this email.</p>
                <hr style="border: none; border-top: 1px solid #2d2d3d; margin: 30px 0;" />
                <p style="font-size: 12px; color: #71717a; text-align: center;">Auvon.AI - Your intelligent learning companion.</p>
            </div>
        </body>
    </html>
    """
    background_tasks.add_task(send_email_sync, to_email, subject, html_content)
