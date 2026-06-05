import os
import secrets
import string
import logging
import requests

from fastapi import BackgroundTasks
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

MOCK_EMAIL_FILE = "mock_emails.txt"


def generate_otp() -> str:
    return "".join(secrets.choice(string.digits) for _ in range(6))


def send_email_sync(to_email: str, subject: str, html_content: str):
    load_dotenv(override=True)

    resend_api_key = os.getenv("RESEND_API_KEY")

    # Fallback to mock mode if API key missing
    if not resend_api_key:
        mock_msg = (
            f"========================================\n"
            f"MOCK EMAIL SENT TO: {to_email}\n"
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

        return

    try:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {resend_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": "Auvon AI <onboarding@resend.dev>",
                "to": [to_email],
                "subject": subject,
                "html": html_content,
            },
            timeout=30,
        )

        if response.status_code >= 400:
            logger.error(f"Resend Status: {response.status_code}")
            logger.error(f"Resend Response: {response.text}")
            raise Exception(response.text)

        logger.info(f"Email successfully sent to {to_email}")

    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")

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


def send_verification_email(
    background_tasks: BackgroundTasks,
    to_email: str,
    name: str,
    code: str
):
    subject = "Verify Your Auvon.AI Account"

    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; background-color: #0f0f13; color: #ffffff; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #1a1a24; padding: 30px; border-radius: 12px; border: 1px solid #2d2d3d;">
                <h1 style="color: #8b5cf6; text-align: center;">Auvon.AI ✨</h1>

                <p>Hello {name},</p>

                <p>
                    Thank you for registering on Auvon.AI.
                    Please use the following 6-digit verification code
                    to confirm your email address:
                </p>

                <div style="text-align: center; margin: 30px 0;">
                    <span style="
                        font-size: 32px;
                        font-weight: bold;
                        letter-spacing: 5px;
                        color: #8b5cf6;
                        padding: 10px 20px;
                        background-color: #0f0f13;
                        border-radius: 8px;
                        border: 1px solid #3c3c52;
                    ">
                        {code}
                    </span>
                </div>

                <p>This code will expire in 15 minutes.</p>

                <p>
                    If you did not sign up for Auvon.AI,
                    you can ignore this email.
                </p>

                <hr style="
                    border: none;
                    border-top: 1px solid #2d2d3d;
                    margin: 30px 0;
                " />

                <p style="
                    font-size: 12px;
                    color: #71717a;
                    text-align: center;
                ">
                    Auvon.AI - Your intelligent learning companion.
                </p>
            </div>
        </body>
    </html>
    """

    background_tasks.add_task(
        send_email_sync,
        to_email,
        subject,
        html_content
    )