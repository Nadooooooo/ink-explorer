const flatKeys = new Set([
  "q", "next_page_params_type", "address_hash", "block_hash", "holders_count",
  "inserted_at", "item_type", "items_count", "name", "transaction_hash",
]);
const cursorKeys = new Set([
  "label[name]", "label[inserted_at]",
  "contract[certified]", "contract[name]", "contract[inserted_at]",
  "token[circulating_market_cap]", "token[fiat_value]", "token[is_verified_via_admin_panel]",
  "token[holder_count]", "token[name]", "token[inserted_at]",
  "metadata_tag[address_hash]", "metadata_tag[metadata_next_page_params]",
  "metadata_tag[metadata_next_page_params][page_token]", "metadata_tag[metadata_next_page_params][page_size]",
  "metadata_tag[end_of_tags]", "metadata_tag[addresses_index]", "tac_operation[page_token]",
]);

// Cursor keys are from Blockscout's search pagination contract. Keep the fixed
// upstream route and reject unrelated parameters instead of opening a proxy.
export function searchQuery(searchParams) {
  const result = new URLSearchParams();
  for (const [key, value] of searchParams) {
    if ((!flatKeys.has(key) && !cursorKeys.has(key)) || result.has(key)) return null;
    result.set(key, key === "q" ? value.trim().slice(0, 140) : value);
  }
  if (!result.has("q")) result.set("q", "");
  return result;
}
