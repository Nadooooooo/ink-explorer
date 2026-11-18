const listFields = ['id', 'title', 'shortDescription', 'categories', 'url'];

/** Project catalogue rows without changing the cached full response or API errors. */
export function dappsResponse(value, view) {
  if (view !== 'list' || !Array.isArray(value)) return value;
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(listFields.filter(key => Object.hasOwn(item, key)).map(key => [key, item[key]]));
  });
}
