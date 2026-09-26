import re, json, unicodedata

with open('full_text_pypdf.txt', encoding='utf-8') as f:
    lines = f.readlines()

noise_pat = re.compile(r'^(===PAGE \d+===|José Antônio Bergamo|Fórmulas Magistrais Chinesas|平\s*衡|\d{1,4})\s*$')
clines = []
for l in lines:
    s = l.rstrip('\n')
    if noise_pat.match(s.strip()):
        continue
    clines.append(s)
text = '\n'.join(clines)

i0 = text.index('CLASSIFICAÇÃO\nFÓRMULAS MAGISTRAIS CHINESAS')
i1 = text.index('CLASSIFICAÇÃO  \nERVAS CHINESAS', i0)
i2 = text.index('CLASSIFICAÇÃO  \nFÓRMULAS DE USO TÓPICAS', i1)
i3 = text.index('FÓRMULAS MAGISTRAIS CHINESAS \nDesvendando')

cls_formulas = text[i0 + len('CLASSIFICAÇÃO\nFÓRMULAS MAGISTRAIS CHINESAS'):i1]
cls_ervas = text[i1 + len('CLASSIFICAÇÃO  \nERVAS CHINESAS'):i2]
cls_topicas = text[i2 + len('CLASSIFICAÇÃO  \nFÓRMULAS DE USO TÓPICAS'):i3]

CODE_LINE = re.compile(r'^\s*(.*?)\s*\((\d{3})\)\s*$')

def is_allcaps(s):
    letters = [c for c in s if c.isalpha()]
    return bool(letters) and all(c.upper() == c for c in letters)

def parse_two_level(section_text):
    raw_lines = [l for l in section_text.split('\n')]
    result = []
    cur_cat = None
    cur_sub = None
    cur_codes = []
    pending_cat_parts = []
    pending_sub_parts = []

    def flush():
        nonlocal cur_codes
        if cur_cat is not None and cur_codes:
            result.append({'categoria': cur_cat, 'subcategoria': cur_sub or '', 'codigos': list(cur_codes)})
        cur_codes = []

    i = 0
    n = len(raw_lines)
    while i < n:
        line = raw_lines[i].strip()
        if not line:
            i += 1
            continue
        m = CODE_LINE.match(line)
        if m and re.search(r'\(\d{3}\)\s*$', line):
            cur_codes.append(m.group(2))
            i += 1
            continue
        if is_allcaps(line):
            # start of a new top-level categoria (possibly spanning multiple lines)
            flush()
            parts = [line]
            j = i + 1
            while j < n and raw_lines[j].strip() and is_allcaps(raw_lines[j].strip()) and not CODE_LINE.match(raw_lines[j].strip()):
                parts.append(raw_lines[j].strip())
                j += 1
            cur_cat = ' '.join(parts)
            cur_sub = ''
            i = j
            continue
        else:
            # subcategoria line (mixed case), may span 2 lines
            flush()
            parts = [line]
            j = i + 1
            while j < n and raw_lines[j].strip() and not is_allcaps(raw_lines[j].strip()) and not CODE_LINE.match(raw_lines[j].strip()):
                parts.append(raw_lines[j].strip())
                j += 1
            cur_sub = ' '.join(parts)
            i = j
            continue
    flush()
    return result

def parse_one_level(section_text):
    raw_lines = [l for l in section_text.split('\n')]
    result = []
    cur_cat = None
    cur_codes = []
    i = 0
    n = len(raw_lines)

    def flush():
        nonlocal cur_codes
        if cur_cat is not None and cur_codes:
            result.append({'categoria': cur_cat, 'subcategoria': '', 'codigos': list(cur_codes)})
        cur_codes = []

    while i < n:
        line = raw_lines[i].strip()
        if not line:
            i += 1
            continue
        m = CODE_LINE.match(line)
        if m and re.search(r'\(\d{3}\)\s*$', line):
            cur_codes.append(m.group(2))
            i += 1
            continue
        # heading line (all-caps or not, single-level: everything non-code is heading)
        flush()
        parts = [line]
        j = i + 1
        while j < n and raw_lines[j].strip() and not CODE_LINE.match(raw_lines[j].strip()):
            parts.append(raw_lines[j].strip())
            j += 1
        cur_cat = ' '.join(parts)
        i = j
    flush()
    return result

cat_formulas = parse_two_level(cls_formulas)
cat_ervas = parse_one_level(cls_ervas)
cat_topicas = parse_one_level(cls_topicas)

print('formulas categorias groups:', len(cat_formulas))
print('ervas categorias groups:', len(cat_ervas))
print('topicas categorias groups:', len(cat_topicas))

total_codes_f = sum(len(g['codigos']) for g in cat_formulas)
total_codes_e = sum(len(g['codigos']) for g in cat_ervas)
total_codes_t = sum(len(g['codigos']) for g in cat_topicas)
print('total codes f/e/t:', total_codes_f, total_codes_e, total_codes_t)

for g in cat_formulas[:6]:
    print(g)
print('---ervas---')
for g in cat_ervas:
    print(g)
print('---topicas---')
for g in cat_topicas:
    print(g)

categorias = []
for g in cat_formulas:
    categorias.append({'tipo': 'formula', 'categoria': g['categoria'], 'subcategoria': g['subcategoria'], 'codigos': g['codigos']})
for g in cat_ervas:
    categorias.append({'tipo': 'erva', 'categoria': g['categoria'], 'subcategoria': '', 'codigos': g['codigos']})
for g in cat_topicas:
    categorias.append({'tipo': 'topica', 'categoria': g['categoria'], 'subcategoria': '', 'codigos': g['codigos']})

with open('categorias_out.json', 'w', encoding='utf-8') as f:
    json.dump(categorias, f, ensure_ascii=False, indent=1)
print('wrote categorias_out.json, total groups:', len(categorias))
