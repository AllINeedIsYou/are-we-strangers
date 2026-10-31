import phonenumbers

def normalize_phone(phone:str):
     phone=phone.strip().removeprefix("tel:")
     if not phone.startswith("+"):
         phone='+'+phone
     parsed = phonenumbers.parse(phone, None)

     return phonenumbers.format_number(
         parsed,
         phonenumbers.PhoneNumberFormat.E164,
     )

def is_phone_number(phone: str) -> bool:
    phone = phone.strip().removeprefix("tel:")
    if not phone.startswith("+"):
        phone = "+" + phone
    try:
        phone_parse = phonenumbers.parse(phone, None)
    except phonenumbers.NumberParseException:
        return False

    return phonenumbers.is_valid_number(phone_parse)