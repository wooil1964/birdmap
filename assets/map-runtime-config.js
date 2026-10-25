/* Deployment-time browser configuration. Never commit a credential here.
 * The reviewed source and downloadable candidate intentionally contain no key.
 * A separately approved deployment may supply this object before initialization.
 */
/* 2026-10-25: VWorld paused (OSM only) until the AWS Lambda concurrency quota (10) is raised; burst tile loads were throttled.
 * Restore: window.BIRDMAP_MAP_CONFIG = window.BIRDMAP_MAP_CONFIG || { vworldMode: 'worker', vworldTileEndpoint: 'https://birdmap-vworld-tiles.birdmap-vworld-isolated.workers.dev/tiles' };
 */
window.BIRDMAP_MAP_CONFIG = window.BIRDMAP_MAP_CONFIG || {};
