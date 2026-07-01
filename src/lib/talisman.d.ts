// Minimal ambient types for the untyped `talisman` phonetics modules we use.
declare module "talisman/phonetics/metaphone" {
  const metaphone: (word: string) => string;
  export default metaphone;
}
declare module "talisman/phonetics/soundex" {
  const soundex: (word: string) => string;
  export default soundex;
}
