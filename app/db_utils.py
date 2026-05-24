# app/db_utils.py

import os
import pandas as pd
import teradatasql
import oracledb
from dotenv import load_dotenv
import numpy as np


import logging

from app.load_to_teradata import clean_col_names

# Load all database credentials from the .env file
load_dotenv()
EDW_USER = os.getenv('EDW_USER')
EDW_PASS = os.getenv('EDW_PASS')
EDW_HOST = os.getenv('TERADATA_HOST')

BGW_USER = os.getenv('BGW_USER')
BGW_PASS = os.getenv('BGW_PASS')

NAR_USER = os.getenv('NAR_USER')
NAR_PASS = os.getenv('NAR_PASS')
NAR_HOST = os.getenv('NAR_HOST')


def get_teradata_connection():
    """Establishes and returns a Teradata database connection."""
    return teradatasql.connect(
        host=EDW_HOST, user=EDW_USER, password=EDW_PASS, logmech='ldap'
    )



def run_teradata_query(query, params=None, use_cache=True):
    """
    Executes a query against the default Teradata database,
    safely handling parameters to prevent crashes and SQL injection.
    Results are now cached.
    """
    # If caching is not requested, go straight to the database
    if not use_cache:
        connection = None
        try:
            connection = get_teradata_connection()
            return pd.read_sql(query, connection, params=params)
        except Exception as e:
            print(f"Error executing non-cached query: {e}")
            return pd.DataFrame()
        finally:
            if connection:
                connection.close()

    # --- Caching logic for when the app is running ---
    from app import cache
    # Create a unique key for this specific query and its parameters
    cache_key = str(hash((query, params)))
    # Try to get the result from the cache first
    result = cache.get(cache_key)
    if result is not None:
        print(f"DEBUG: Returning result from cache for key: {cache_key}")
        return result

    print(f"DEBUG: Query not in cache, running against database for key: {cache_key}")
    connection = None
    try:
        connection = get_teradata_connection()
        df = pd.read_sql(query, connection, params=params)

        # Store the new result in the cache for next time
        cache.set(cache_key, df, timeout=300)  # timeout is in seconds (5 minutes)

        return df
    except Exception as e:
        print(f"Error executing query: {e}")
        return pd.DataFrame()
    finally:
        if connection:
            connection.close()

def get_oracle_bgw_connection():
    """Establishes and returns a connection to the Oracle BGW database."""
    return oracledb.connect(
        user=BGW_USER, password=BGW_PASS, host="tpapx1-scan",
        port=1521, service_name="BGWDR"
    )

def get_oracle_nar_connection():
    """Establishes and returns a connection to the Oracle NARPROD database."""
    return oracledb.connect(
        user=NAR_USER, password=NAR_PASS, host=NAR_HOST,
        port=1521, service_name="NARPROD"
    )

def run_oracle_query(query, connection_func=get_oracle_nar_connection):
    """
    Executes a query against the specified Oracle database.
    Defaults to BGW, but can be changed.
    """
    with connection_func() as connection:
        return pd.read_sql(query, connection)




def upload_df_to_teradata_temp_table(df, connection, table_name):
    """
    Uploads a pandas DataFrame to a volatile (temporary) Teradata table.
    """
    try:
        cursor = connection.cursor()
        logging.info(f"Creating temporary table: {table_name}")

        def get_teradata_type(dtype: np.dtype, max_length: int = None) -> str:
            """Maps a pandas dtype to an appropriate Teradata data type."""
            if pd.api.types.is_integer_dtype(dtype):
                return "INTEGER"
            elif pd.api.types.is_float_dtype(dtype):
                return "FLOAT"
            elif pd.api.types.is_datetime64_any_dtype(dtype):
                return "TIMESTAMP(6)"
            elif pd.api.types.is_bool_dtype(dtype):
                return "BYTEINT"
            else:
                return "VARCHAR(500)"

        columns = []
        for col in df.columns:
            col_dtype = get_teradata_type(df[col].dtype)
            clean_col_names = col.replace(' ','_').replace('-','_').replace('(', '').replace(')', '')
            columns.append(f"{clean_col_names} {col_dtype}")

        column_definitions = ", ".join(columns)

        # Create volatile table
        create_table_sql = f"CREATE VOLATILE TABLE {table_name} ({column_definitions}) ON COMMIT PRESERVE ROWS"
        cursor.execute(create_table_sql)
        logging.info(f"Created volatile table: {table_name}")

        # Prepare the insert statement
        clean_columns = [col.replace(' ', '_').replace('-', '_').replace('(', '').replace(')', '') for col in
                         df.columns]
        placeholders = ', '.join(['?'] * len(clean_columns))
        insert_sql = f"INSERT INTO {table_name} ({', '.join(clean_columns)}) VALUES ({placeholders})"

        # Convert DataFrame to list of tuples for bulk insert
        logging.info(f"Uploading {len(df)} rows to temporary table...")
        data_tuples = []
        for _, row in df.iterrows():
            # Convert each row to tuple, handling NaN values
            row_tuple = tuple(None if pd.isna(val) else str(val) for val in row)
            data_tuples.append(row_tuple)

        # Use executemany for bulk insert
        cursor.executemany(insert_sql, data_tuples)
        logging.info("Upload complete.")

        # Verify the upload
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        count = cursor.fetchone()[0]
        logging.info(f"Verified: {count} rows in temp table {table_name}")

    except Exception as e:
        logging.error(f"Failed to upload DataFrame to temporary table: {e}", exc_info=True)
        raise


def execute_teradata_update(sql, params=None):
    """
    Executes a non-query statement (UPDATE, INSERT, DELETE) against Teradata.
    Returns the number of rows affected.
    """
    # updated_count = 0
    # with get_teradata_connection() as con:
    #     with con.cursor() as cur:
    #         cur.execute(sql, params)
    #         updated_count = cur.rowcount
    # return updated_count
    connection = None
    try:
        connection = get_teradata_connection()
        with connection.cursor() as cur:
            cur.execute(sql, params)

            connection.commit()
            print("Update committed successfully.")
    except Exception as e:
        print(f"Error executing update: {e}")
        if connection:
            connection.rollback()  # Roll back changes on error
        # Re-raise the exception so the calling script knows something went wrong
        raise e
    finally:
        if connection:
            connection.close()