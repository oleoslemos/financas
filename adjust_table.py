import json, pathlib, re

input_path = pathlib.Path(r'c:/Repositorio/sistema-financeiro/tabela-preco.json')
output_path = pathlib.Path(r'c:/Repositorio/sistema-financeiro/tabela_atualizada.json')

with input_path.open('r', encoding='utf-8') as f:
    data = json.load(f)

# Define replacements for English terms to Portuguese
replacements = {
    r'\bBOX\b': 'CAIXA',
    r'\bSLIM\b': 'FINO',
    # Add more mappings if needed
}

for item in data:
    # Remove "ponto" if present
    item.pop('ponto', None)
    # Apply replacements in product_line and product_name
    for field in ['product_line', 'product_name']:
        if field in item and isinstance(item[field], str):
            text = item[field]
            for pattern, repl in replacements.items():
                text = re.sub(pattern, repl, text, flags=re.IGNORECASE)
            item[field] = text

with output_path.open('w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print('Adjusted table written to', output_path)

