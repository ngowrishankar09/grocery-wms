from sqlalchemy.orm import sessionmaker
from models import get_engine, create_tables

engine = get_engine()
create_tables(engine)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
