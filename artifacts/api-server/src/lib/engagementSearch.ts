function matchesWildcard(value: string, pattern: string): boolean {
  let valueIndex = 0;
  let patternIndex = 0;
  let wildcardIndex = -1;
  let wildcardValueIndex = -1;

  while (valueIndex < value.length) {
    if (patternIndex < pattern.length && pattern[patternIndex] === value[valueIndex]) {
      valueIndex += 1;
      patternIndex += 1;
    } else if (patternIndex < pattern.length && pattern[patternIndex] === "%") {
      wildcardIndex = patternIndex;
      wildcardValueIndex = valueIndex;
      patternIndex += 1;
    } else if (wildcardIndex !== -1) {
      patternIndex = wildcardIndex + 1;
      wildcardValueIndex += 1;
      valueIndex = wildcardValueIndex;
    } else {
      return false;
    }
  }

  while (patternIndex < pattern.length && pattern[patternIndex] === "%") {
    patternIndex += 1;
  }
  return patternIndex === pattern.length;
}

/**
 * Case-insensitive prospect search. Plain text keeps the existing substring
 * behavior; "%" follows familiar SQL wildcard semantics without being passed
 * to SQL or interpreted as a regular expression.
 */
export function matchesEngagementSearch(
  values: Array<string | null | undefined>,
  rawPattern: string,
): boolean {
  const pattern = rawPattern.trim();
  if (!pattern || pattern === "%") return true;

  if (!pattern.includes("%")) {
    const needle = pattern.toLocaleLowerCase();
    return values.some(value => (value ?? "").toLocaleLowerCase().includes(needle));
  }

  const normalizedPattern = pattern.toLocaleLowerCase();
  return values.some(value => matchesWildcard(
    (value ?? "").toLocaleLowerCase(),
    normalizedPattern,
  ));
}