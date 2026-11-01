from backend.app.core.mail_config import mail_settings
from email.message import EmailMessage
from smtplib import SMTP_SSL
from ssl import create_default_context

def send_email(to_email:str,subject:str,text:str):
    message=EmailMessage()

    message['To']=to_email
    message['From']=mail_settings.SMTP_USERNAME
    message['Subject']=subject
    message.set_content(text)

    with SMTP_SSL(
            host=mail_settings.SMTP_HOST,
            port=mail_settings.SMTP_PORT,
            context=create_default_context(),
            timeout=10,
    ) as smtp:
        smtp.login(mail_settings.SMTP_USERNAME,mail_settings.SMTP_PASSWORD.get_secret_value())
        smtp.send_message(message)

