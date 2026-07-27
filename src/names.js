/**
 * Names for players, drawn from Greek myth. Kept well away from Atlas himself —
 * he has enough to do.
 */
const NAMES = [
  'Achilles', 'Adonis', 'Aeolus', 'Ajax', 'Alcmene', 'Andromeda', 'Antigone',
  'Ariadne', 'Artemis', 'Astraea', 'Atalanta', 'Bellerophon', 'Briseis',
  'Calliope', 'Cassandra', 'Castor', 'Circe', 'Clio', 'Daedalus', 'Danae',
  'Daphne', 'Demeter', 'Dionysus', 'Echo', 'Electra', 'Endymion', 'Eos',
  'Erato', 'Eurydice', 'Ganymede', 'Hebe', 'Hecate', 'Hector', 'Helios',
  'Hermes', 'Hero', 'Hestia', 'Hypnos', 'Icarus', 'Io', 'Iris', 'Jason',
  'Leander', 'Leto', 'Medea', 'Meleager', 'Morpheus', 'Nestor', 'Nike', 'Niobe',
  'Oceanus', 'Odysseus', 'Orion', 'Orpheus', 'Pandora', 'Paris', 'Patroclus',
  'Peleus', 'Penelope', 'Perseus', 'Phoebe', 'Pollux', 'Priam', 'Psyche',
  'Rhea', 'Selene', 'Semele', 'Theseus', 'Thalia', 'Triton', 'Urania', 'Zephyr',
];

/**
 * A name not already in `taken`, so a table of four never doubles up.
 * @param {readonly string[]} [taken]
 * @returns {string}
 */
export function randomName(taken = []) {
  const free = NAMES.filter((n) => !taken.includes(n));
  const pool = free.length ? free : NAMES;
  return pool[Math.floor(Math.random() * pool.length)];
}
