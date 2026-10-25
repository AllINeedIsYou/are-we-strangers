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