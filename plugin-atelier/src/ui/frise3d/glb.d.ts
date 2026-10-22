/** Le modèle Blender est embarqué tel quel dans le fichier de la scène (chargeur « binary » d'esbuild). */
declare module "*.glb" {
  const octets: Uint8Array;
  export default octets;
}
