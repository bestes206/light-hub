export function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'assertEqual') + `: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertDeepEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error((message || 'assertDeepEqual') + `: expected ${e}, got ${a}`);
  }
}

export function assertBytes(actual, expected, message) {
  const actualArr = Array.from(actual);
  const expectedArr = Array.from(expected);
  if (actualArr.length !== expectedArr.length || actualArr.some((b, i) => b !== expectedArr[i])) {
    const fmt = (arr) => '[' + arr.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ') + ']';
    throw new Error((message || 'assertBytes') + `: expected ${fmt(expectedArr)}, got ${fmt(actualArr)}`);
  }
}

export async function runSuite(name, tests) {
  const results = [];
  for (const [testName, fn] of Object.entries(tests)) {
    try {
      await fn();
      results.push({ suite: name, test: testName, ok: true });
    } catch (e) {
      results.push({ suite: name, test: testName, ok: false, error: e.message });
    }
  }
  return results;
}
