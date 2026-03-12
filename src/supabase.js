import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://mgrbxecthpcallxermkb.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncmJ4ZWN0aHBjYWxseGVybWtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNjgyMTMsImV4cCI6MjA4ODc0NDIxM30.scP1fC5NN1NMIJnhSpEcpNZZ5tMfsipa9Xi1oRiRsn0'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// --- Auth helpers ---

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  return { user: data?.user ?? null, error }
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { user: data?.user ?? null, error }
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data?.user ?? null
}

export async function onAuthStateChange(callback) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback)
  return subscription
}

// --- Vault helpers ---

export async function getVault(userId) {
  const { data, error } = await supabase
    .from('user_vault')
    .select('salt, iteration_count, vault_version')
    .eq('user_id', userId)
    .single()
  if (error || !data) return null
  return data
}

export async function createVault(userId, salt, iterationCount = 600000) {
  const { error } = await supabase
    .from('user_vault')
    .insert({ user_id: userId, salt, iteration_count: iterationCount })
  return { success: !error, error }
}

// --- Data helpers ---

export async function saveEncryptedData(userId, dataType, encryptedBlob) {
  const { error } = await supabase
    .from('user_data')
    .upsert(
      { user_id: userId, data_type: dataType, encrypted_blob: encryptedBlob, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,data_type' }
    )
  return { success: !error, error }
}

export async function loadEncryptedData(userId, dataType) {
  const { data, error } = await supabase
    .from('user_data')
    .select('encrypted_blob')
    .eq('user_id', userId)
    .eq('data_type', dataType)
    .single()
  if (error || !data) return null
  return data.encrypted_blob
}

export async function loadAllEncryptedData(userId) {
  const { data, error } = await supabase
    .from('user_data')
    .select('data_type, encrypted_blob')
    .eq('user_id', userId)
  if (error || !data) return {}
  return Object.fromEntries(data.map(row => [row.data_type, row.encrypted_blob]))
}

export async function deleteEncryptedData(userId, dataType) {
  const { error } = await supabase
    .from('user_data')
    .delete()
    .eq('user_id', userId)
    .eq('data_type', dataType)
  return { success: !error, error }
}

// --- Tier helper ---

export async function getUserTier(userId) {
  const { data, error } = await supabase
    .from('user_tier')
    .select('tier')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return 'free'
  return data.tier
}
