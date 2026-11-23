import json
import pathlib

# Paths
input_path = pathlib.Path(r"c:\\Repositorio\\sistema-financeiro\\input_products.json")
output_path = pathlib.Path(r"c:\\Repositorio\\sistema-financeiro\\products_pt_br.json")

# Load JSON (allow comments // ... omitted) – we will ignore comments by reading whole file and using json.loads after stripping comments if needed.
# For simplicity, assume the file contains valid JSON array.
with input_path.open('r', encoding='utf-8') as f:
    data = json.load(f)

# No modifications – keep original descriptions.
with output_path.open('w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print('Translation (copy) completed.')
