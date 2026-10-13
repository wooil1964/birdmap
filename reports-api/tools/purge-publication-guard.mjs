// The legacy REST purge commits child deletes separately. Do not start it
// against a publication-fenced DB: protected DELETE would fail too late.
export function assertLegacyPurgeCompatible(tables) {
 if(tables.has('publication_writer_claim')||tables.has('public_publication_state')){
  const error=new Error('PURGE_PUBLICATION_ATOMIC_REQUIRED');
  error.code='PURGE_PUBLICATION_ATOMIC_REQUIRED';
  throw error;
 }
}
