from sqlalchemy import create_engine
from backend.database.config import settings
from sqlalchemy.orm import sessionmaker, Session
from fastapi import Depends
from typing import Annotated


engine=create_engine(settings.DATABASE_URL)

SessionLocal = sessionmaker(bind=engine)


def get_session():
    with SessionLocal() as session:
        yield session

SessionDep=Annotated[Session, Depends(get_session)]