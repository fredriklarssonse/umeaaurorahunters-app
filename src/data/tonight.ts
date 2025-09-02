
type TonightBundle = unknown; // temp

type RpcArgs = { p_location_id: string; p_tz?: string };

export async function fetchTonightBundle(supabase: any, args: RpcArgs): Promise<TonightBundle> {
  const { data, error } = await supabase.rpc('get_tonight_window_bundle_by_id', {
    p_location_id: args.p_location_id,
    p_tz: args.p_tz ?? 'Europe/Stockholm',
  });
  if (error) throw new Error(`rpc.get_tonight_window_bundle_by_id: ${error.message}`);
  return data as TonightBundle;
}

