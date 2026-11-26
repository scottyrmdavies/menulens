function endOfObject(text, start) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function completeDishes(raw) {
  const start = raw.indexOf('[');
  if (start === -1) return [];
  const dishes = [];
  let i = start + 1;
  while (i < raw.length) {
    while (i < raw.length && /[\s,]/.test(raw[i])) i += 1;
    if (i >= raw.length || raw[i] === ']') break;
    if (raw[i] !== '{') break;
    const end = endOfObject(raw, i);
    if (end === -1) break;
    try {
      dishes.push(JSON.parse(raw.slice(i, end + 1)));
    } catch {
      break;
    }
    i = end + 1;
  }
  return dishes;
}

function createDishParser() {
  let raw = '';
  let emitted = 0;
  return {
    push(delta) {
      raw += delta;
      const found = completeDishes(raw);
      const fresh = found.slice(emitted);
      emitted = found.length;
      return fresh;
    },
  };
}

async function* readSseData(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data && data !== '[DONE]') yield data;
    }
  }
}

export { completeDishes, createDishParser, readSseData };
