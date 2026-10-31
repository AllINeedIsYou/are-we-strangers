import hashlib
from pwdlib import PasswordHash
import secrets


password_hasher = PasswordHash.recommended()

def hash_password(password:str):
    password_hash=password_hasher.hash(password)
    return password_hash

def verify_password(password:str,password_hash:str):
    return password_hasher.verify(password,password_hash)

def generate_token():
    token=secrets.token_urlsafe(32)
    return token

def hash_token(token:str):
    token_hash= hashlib.sha256(token.encode('utf-8')).hexdigest()
    return token_hash

def generate_verification_code():
    code=str(secrets.randbelow(1_000_000)).zfill(6)
    return code

def hash_verification_code(code:str):
    code_hash=password_hasher.hash(code)
    return code_hash

def verify_verification_code(code: str, code_hash: str):
    return password_hasher.verify(code,code_hash)