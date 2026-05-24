# load_to_teradata.py

# PURPOSE:
# This is a ONE-TIME utility script to upload your CSV data into a Teradata table.
# It reads the local CSV file and uses SQLAlchemy to create and populate the
# specified table in Teradata, making future queries much faster.
#
# HOW TO RUN:
# 1. Make sure you have installed the required libraries:
#    pip install pandas teradatasql sqlalchemy sqlalchemy-teradata
# 2. Set your EDW_USER and EDW_PASS environment variables.
# 3. Place this script in the same directory as your 'sample_clli.xlsx - Sheet1.csv' file.
# 4. Run the script from your terminal: python load_to_teradata.py


import os
import pandas as pd
import teradatasql
import re
from dotenv import load_dotenv
load_dotenv()

# --- Configuration ---
script_dir = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(script_dir, "sample_clli.csv")
TABLE_NAME = "PS_CLLI_SAMPLE"
DATABASE_NAME = "SND_PSP"

# --- Get Teradata credentials from environment variables ---
EDW_USER = os.environ.get('EDW_USER')
EDW_PASS = os.environ.get('EDW_PASS')



TERADATA_HOST = os.environ.get('TERADATA_HOST')


def clean_col_names(df):
    """Cleans column names to be database-friendly."""
    cols = df.columns
    new_cols = []
    for col in cols:
        # Replace special characters and spaces with underscores
        new_col = re.sub(r'[^a-zA-Z0-9_]', '_', col)
        # Ensure the column name doesn't start with a number
        if new_col[0].isdigit():
            new_col = '_' + new_col
        new_cols.append(new_col)
    df.columns = new_cols
    return df


# HELPER FUNCTION
def pandas_to_teradata_type(dtype):
    """Maps pandas dtype to a Teradata SQL type."""
    if "int" in str(dtype):
        return "BIGINT"
    elif "float" in str(dtype):
        return "FLOAT"
    elif "datetime" in str(dtype):
        return "TIMESTAMP"
    # Default to VARCHAR for object/string types
    return "VARCHAR(255)"




def load_data_to_teradata():
    """Reads the CSV and uploads its contents to a Teradata table."""

    if not EDW_USER or not EDW_PASS:
        print("FATAL ERROR: Missing Database Credentials.")
        print("Please make sure your .env file is created and contains EDW_USER and EDW_PASS.")
        return

    print("--- Starting Teradata Data Load Process ---")

    try:
        print(f"Step 1/3: Reading and preparing data from '{CSV_FILE}'...")
        # Replace NaN with empty strings to prevent data type issues on insert
        df = pd.read_csv(CSV_FILE).fillna('')
        df = clean_col_names(df)
        print(f"   > Successfully read {len(df):,} records.")

        print("Step 2/3: Connecting to Teradata and preparing table...")
        with teradatasql.connect(host=TERADATA_HOST, user=EDW_USER, password=EDW_PASS, logmech='ldap') as connection:
            print("   > Connection successful.")

            with connection.cursor() as cursor:
                FULL_TABLE_NAME = f'{DATABASE_NAME}.{TABLE_NAME}'
                print(f"   > Preparing table '{FULL_TABLE_NAME}'...")

                # A) Drop the table if it exists (ignore errors if it doesn't)
                try:
                    print(f"     > Dropping existing table (if any)...")
                    cursor.execute(f"DROP TABLE {FULL_TABLE_NAME}")
                except teradatasql.Error as e:
                    # Error code 3807 means "Object does not exist", which is fine.
                    if "3807" not in str(e):
                        raise  # Re-raise other errors

                # B) Create the table with correct column types
                print(f"     > Creating new table...")
                column_definitions = [f'"{col}" {pandas_to_teradata_type(dtype)}' for col, dtype in df.dtypes.items()]
                create_table_sql = f"CREATE TABLE {FULL_TABLE_NAME} ({', '.join(column_definitions)})"
                cursor.execute(create_table_sql)
                print(f"     > Table created successfully.")

                # Step 3/3: Manually insert data in chunks for memory efficiency
                print(f"Step 3/3: Writing {len(df):,} records to '{FULL_TABLE_NAME}'...")

                # Create the INSERT statement with placeholders
                placeholders = ', '.join(['?'] * len(df.columns))
                insert_sql = f"INSERT INTO {FULL_TABLE_NAME} VALUES ({placeholders})"

                # Set a chunk size
                chunksize = 10000
                total_chunks = (len(df) // chunksize) + 1

                # Iterate over the dataframe in chunks and insert
                for i in range(0, len(df), chunksize):
                    chunk = df[i:i + chunksize]
                    data_to_insert = [tuple(x) for x in chunk.to_numpy()]
                    print(f"   > Writing chunk {i // chunksize + 1} of {total_chunks}...")
                    cursor.executemany(insert_sql, data_to_insert)

                print("   > Data written successfully!")

        print("\n--- Data Load Complete! ---")
        print(f"The table '{FULL_TABLE_NAME}' is now populated in Teradata.")

    except FileNotFoundError:
        print(f"\nFATAL ERROR: The source file '{CSV_FILE}' was not found.")
    except Exception as e:
        print(f"\nAN ERROR OCCURRED: {e}")
        print("   > Please check your credentials, permissions, and network connection.")


if __name__ == "__main__":
    load_data_to_teradata()
