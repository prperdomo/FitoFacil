import re, json

with open('full_text_pypdf.txt', encoding='utf-8') as f:
    lines = f.readlines()

noise_pat = re.compile(r'^(===PAGE \d+===|José Antônio Bergamo|Fórmulas Magistrais Chinesas|平\s*衡|\d{1,4})\s*$')

def clean(ls):
    out = []
    for l in ls:
        s = l.rstrip('\n')
        if noise_pat.match(s.strip()):
            continue
        out.append(s)
    return out

clines = clean(lines)
text = '\n'.join(clines)

idx_formulas_start = text.index('AN MIAN PIAN (091)', text.index('Desvendando as Fórmulas Magistrais Chinesas'))
idx_ervas_chapter = text.index('ERVAS CHINESAS ISOLADAS', idx_formulas_start)
idx_ervas_start = text.index('CI WU JIA (202)', idx_ervas_chapter)
idx_topicas_chapter = text.index('FÓRMULAS CHINESAS DE USO TÓPICO', idx_ervas_start)
idx_topicas_start = text.index('ANEMARRHENAE COMPOSTO (301)', idx_topicas_chapter)
idx_topicas_end = text.index('ORIENTAÇÕES AO USO', idx_topicas_start)

formulas_text = text[idx_formulas_start:idx_ervas_chapter]
ervas_text = text[idx_ervas_start:idx_topicas_chapter]
topicas_text = text[idx_topicas_start:idx_topicas_end]

HEADER_RE = re.compile(r'^[ \t]*([A-ZÀ-Ý][^\n]*?)[ \t]*\((\d{3})\)[ \t]*$', re.MULTILINE)

def split_entries(section_text):
    raw_matches = list(HEADER_RE.finditer(section_text))
    matches = []
    for m in raw_matches:
        if matches and matches[-1].group(2) == m.group(2):
            continue
        matches.append(m)
    entries = []
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i+1].start() if i+1 < len(matches) else len(section_text)
        entries.append({'name': m.group(1).strip(), 'id': m.group(2), 'block': section_text[start:end]})
    return entries

def parse_ingredient_row(line):
    line = line.strip()
    if not line:
        return None
    m = re.search(r'([\d]+(?:[.,]\d+)?)\s*$', line)
    if not m:
        return None
    pct = m.group(1).replace('.', ',')
    rest = line[:m.start()].rstrip()
    if not rest:
        return None
    parts = re.split(r'\s{2,}', rest)
    if len(parts) >= 2:
        cn = ' '.join(parts[:-1]).strip()
        sci = parts[-1].strip()
    else:
        cn = rest.strip()
        sci = ''
    if not cn:
        return None
    return {'nome_chines': cn, 'nome_cientifico': sci, 'percentual': pct}

LABELS_FORMULA = ['Indicação:', 'Ações:', 'Síndromes:', 'Sintomas e Sinais:', 'Sinais e Sintomas:', 'Língua:', 'Saburra:', 'Pulso:']

def extract_field(block, label, stop_labels):
    if stop_labels:
        lookahead = r'(?=' + '|'.join(re.escape(s) for s in stop_labels) + r'|\Z)'
    else:
        lookahead = r'\Z'
    pat = re.compile(re.escape(label) + r'\s*(.*?)' + lookahead, re.DOTALL)
    m = pat.search(block)
    if not m:
        return ''
    val = m.group(1)
    val = re.sub(r'\s+', ' ', val).strip()
    val = val.rstrip('.;').strip()
    return val

def parse_formula_block(name, cid, block):
    lines_b = block.split('\n')
    header_line = lines_b[0]
    rest_lines = lines_b[1:]
    # western name (optional) - first non-empty line wrapped in parens
    idx = 0
    western = ''
    while idx < len(rest_lines) and rest_lines[idx].strip() == '':
        idx += 1
    if idx < len(rest_lines) and rest_lines[idx].strip().startswith('(') and rest_lines[idx].strip().endswith(')'):
        western = rest_lines[idx].strip()[1:-1]
        idx += 1
    # category: lines until we hit 'Indicação:' anchor
    cat_lines = []
    remaining = '\n'.join(rest_lines[idx:])
    m_ind = re.search(r'Indicação:', remaining)
    if m_ind:
        cat_text = remaining[:m_ind.start()]
        cat_lines = [l.strip() for l in cat_text.split('\n') if l.strip()]
        body = remaining[m_ind.start():]
    else:
        body = remaining
    category = ' '.join(cat_lines).strip()

    # find ingredient table separator
    sep_idx = body.find('___')
    if sep_idx == -1:
        fields_text = body
        ing_text = ''
    else:
        fields_text = body[:sep_idx]
        ing_text = body[sep_idx:]

    indicacao = extract_field(fields_text, 'Indicação:', ['Ações:'])
    acoes = extract_field(fields_text, 'Ações:', ['Síndromes:'])
    sindromes = extract_field(fields_text, 'Síndromes:', ['Sintomas e Sinais:', 'Sinais e Sintomas:']) or extract_field(fields_text, 'Sindromes:', ['Sintomas e Sinais:', 'Sinais e Sintomas:'])
    sintomas = extract_field(fields_text, 'Sintomas e Sinais:', ['Língua:', 'Lingua:']) or extract_field(fields_text, 'Sinais e Sintomas:', ['Língua:', 'Lingua:'])
    lingua = extract_field(fields_text, 'Língua:', ['Saburra:']) or extract_field(fields_text, 'Lingua:', ['Saburra:'])
    saburra = extract_field(fields_text, 'Saburra:', ['Pulso:'])
    pulso = extract_field(fields_text, 'Pulso:', [])

    # ingredients + notes
    ing_lines = ing_text.split('\n')[1:]  # drop the ___ line itself
    ingredients = []
    notes = []
    started_header = False
    for l in ing_lines:
        s = l.strip()
        if not s:
            continue
        if not started_header and re.match(r'^Nome\s+[Cc]hin', s):
            started_header = True
            continue
        if s.startswith('**') or s.lower().startswith('nota:') or s.lower().startswith('obs'):
            notes.append(s.lstrip('*').strip())
            continue
        row = parse_ingredient_row(s)
        if row:
            ingredients.append(row)
        else:
            # possibly a continuation / note line
            notes.append(s)

    return {
        'id': cid,
        'pinyin_name': name.strip(),
        'western_name': western.strip(),
        'category': category.strip(),
        'indicacao': indicacao,
        'acoes': acoes,
        'sindromes': sindromes,
        'sintomas_sinais': sintomas,
        'lingua': lingua,
        'saburra': saburra,
        'pulso': pulso,
        'ingredients': ingredients,
        'notes': ' '.join(notes).strip()
    }

def parse_erva_block(name, cid, block):
    lines_b = block.split('\n')
    rest_lines = lines_b[1:]
    idx = 0
    while idx < len(rest_lines) and rest_lines[idx].strip() == '':
        idx += 1
    western = ''
    if idx < len(rest_lines) and rest_lines[idx].strip().startswith('(') and rest_lines[idx].strip().endswith(')'):
        western = rest_lines[idx].strip()[1:-1]
        idx += 1
    remaining = '\n'.join(rest_lines[idx:])
    m_ind = re.search(r'Indicação:', remaining)
    if m_ind:
        cat_text = remaining[:m_ind.start()]
        category = ' '.join(l.strip() for l in cat_text.split('\n') if l.strip())
        body = remaining[m_ind.start():]
    else:
        category = ''
        body = remaining
    indicacao = extract_field(body, 'Indicação:', ['Características:', 'Caracteristicas:', 'Caracteristica:', 'Característica:'])
    caracteristicas = (extract_field(body, 'Características:', ['Canais:']) or extract_field(body, 'Caracteristicas:', ['Canais:'])
                        or extract_field(body, 'Caracteristica:', ['Canais:']) or extract_field(body, 'Característica:', ['Canais:']))
    canais = extract_field(body, 'Canais:', ['Ações:'])
    acoes = extract_field(body, 'Ações:', [])
    return {
        'id': cid,
        'pinyin_name': name.strip(),
        'western_name': western.strip(),
        'category': category.strip(),
        'indicacao': indicacao,
        'caracteristicas': caracteristicas,
        'canais': canais,
        'acoes': acoes
    }

def parse_topica_block(name, cid, block):
    lines_b = block.split('\n')
    rest_lines = lines_b[1:]
    idx = 0
    while idx < len(rest_lines) and rest_lines[idx].strip() == '':
        idx += 1
    remaining = '\n'.join(rest_lines[idx:])
    m_ind = re.search(r'Indicação:', remaining)
    if m_ind:
        cat_text = remaining[:m_ind.start()]
        category = ' '.join(l.strip() for l in cat_text.split('\n') if l.strip())
        body = remaining[m_ind.start():]
    else:
        category = ''
        body = remaining
    indicacao = extract_field(body, 'Indicação:', ['Ações:'])
    acoes = extract_field(body, 'Ações:', ['Apresentações:'])
    apresentacoes = extract_field(body, 'Apresentações:', [])

    sep_idx = body.find('___')
    ing_text = body[sep_idx:] if sep_idx != -1 else ''
    ing_lines = ing_text.split('\n')[1:]
    ingredients = []
    notes = []
    started_header = False
    for l in ing_lines:
        s = l.strip()
        if not s:
            continue
        if not started_header and re.match(r'^Nome\s+[Cc]hin', s):
            started_header = True
            continue
        if s.startswith('**') or s.lower().startswith('nota:'):
            notes.append(s.lstrip('*').strip())
            continue
        row = parse_ingredient_row(s)
        if row:
            ingredients.append(row)
        else:
            notes.append(s)
    # apresentacoes may bleed into ing_text region if no ___ present; already extracted via body regardless
    apresentacoes = re.sub(r'_+.*$', '', apresentacoes, flags=re.DOTALL).strip()

    return {
        'id': cid,
        'pinyin_name': name.strip(),
        'category': category.strip(),
        'indicacao': indicacao,
        'acoes': acoes,
        'apresentacoes': apresentacoes,
        'ingredients': ingredients,
        'notes': ' '.join(notes).strip()
    }

f_entries = split_entries(formulas_text)
e_entries = split_entries(ervas_text)
t_entries = split_entries(topicas_text)

formulas = [parse_formula_block(e['name'], e['id'], e['block']) for e in f_entries]
ervas = [parse_erva_block(e['name'], e['id'], e['block']) for e in e_entries]
topicas = [parse_topica_block(e['name'], e['id'], e['block']) for e in t_entries]

import unicodedata
def norm(s):
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return s.lower().strip()

known_pairs = {}
for coll in (formulas, topicas):
    for entry in coll:
        for ing in entry['ingredients']:
            if ing['nome_cientifico']:
                known_pairs.setdefault(norm(ing['nome_chines']), (ing['nome_chines'], ing['nome_cientifico']))

def backfill(entry):
    for ing in entry['ingredients']:
        if not ing['nome_cientifico']:
            raw_norm = norm(ing['nome_chines'])
            best = None
            for cn_norm, (cn, sci) in known_pairs.items():
                if raw_norm == cn_norm or raw_norm.startswith(cn_norm + ' '):
                    if best is None or len(cn_norm) > len(best[0]):
                        best = (cn_norm, cn, sci)
            if best:
                ing['nome_chines'] = best[1]
                ing['nome_cientifico'] = best[2]

for coll in (formulas, topicas):
    for entry in coll:
        backfill(entry)

# manual fix: source has a garbled pinyin row ("Dóng Chong Xia Cáo Cordyceps Sinensis")
# for this single ingredient that the automatic backfill (built from formulas/topicas
# ingredient tables only) can't match; the clean name/sci pair is confirmed from the
# "ervas isoladas" chapter entry id 200 (DONG CHONG XIA CAO / Cordyceps Sinensis).
for entry in formulas:
    for ing in entry['ingredients']:
        if not ing['nome_cientifico'] and 'Chong Xia' in ing['nome_chines']:
            ing['nome_chines'] = 'Dong Chong Xia Cao'
            ing['nome_cientifico'] = 'Cordyceps Sinensis'

print('formulas:', len(formulas))
print('ervas:', len(ervas))
print('topicas:', len(topicas))

# sanity: ingredient count stats
no_ing = [f['id']+' '+f['pinyin_name'] for f in formulas if len(f['ingredients'])==0]
print('formulas with zero ingredients:', len(no_ing))
print(no_ing[:20])

no_ind = [f['id']+' '+f['pinyin_name'] for f in formulas if not f['indicacao']]
print('formulas missing indicacao:', len(no_ind), no_ind[:10])

with open('data_out.json', 'w', encoding='utf-8') as f:
    json.dump({'formulas': formulas, 'ervas': ervas, 'topicas': topicas}, f, ensure_ascii=False, indent=1)
print('wrote data_out.json')
