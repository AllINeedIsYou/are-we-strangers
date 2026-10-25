from pwdlib import PasswordHash

password_hasher = PasswordHash.recommended()

def hash_password(password:str):
    password_hash=password_hasher.hash(password)
    return password_hash

def verify_password(password:str,password_hash:str):
    return password_hasher.verify(password,password_hash)