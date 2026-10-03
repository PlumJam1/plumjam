import type Phaser from 'phaser';

/** Geometry is temporary; art can replace it without changing game state. */
export function drawPlaceholder(scene: Phaser.Scene, battle: boolean): void {
  scene.cameras.main.setBackgroundColor(battle ? '#233342' : '#314452');
  const graphics = scene.add.graphics();
  graphics.fillStyle(0x52626b).fillRect(0, 154, 640, 85);
  for (let x = 0; x < 640; x += 54) {
    const height = 32 + (x % 89);
    graphics.fillStyle(x < 300 ? 0x46505a : 0x293545).fillRect(x, 239 - height, 42, height);
  }
  graphics.fillStyle(0x151c27).fillRect(0, 229, 640, 51);
  graphics.fillStyle(0x74827b).fillRect(0, 229, 640, 4);
  for (let x = 0; x < 640; x += 28) graphics.fillStyle(0x3e474b).fillRect(x, 254, 15, 2);
  graphics.fillStyle(0xe5bb78).fillRect(25, 167, 57, 63);
  graphics.fillStyle(0x77614f).fillRect(20, 159, 67, 9);
  graphics.fillStyle(0x453c40).fillRect(46, 197, 18, 33);
  graphics.fillStyle(0x131e2b).fillRect(552, 130, 65, 100);
  graphics.fillStyle(0x547386).fillRect(548, 122, 73, 8);
  for (let y = 142; y < 215; y += 17) graphics.fillStyle(0x75d7db).fillRect(562, y, 45, 3);
  if (scene.textures.exists('seoultech-symbol')) scene.add.image(54, 182, 'seoultech-symbol').setDisplaySize(30, 28);
  if (battle) return;
  graphics.fillStyle(0xf5cba2).fillRect(110, 190, 12, 12);
  graphics.fillStyle(0xdf886c).fillRect(108, 202, 16, 16);
  graphics.fillStyle(0x34415a).fillRect(109, 218, 5, 12).fillRect(118, 218, 5, 12);
  graphics.fillStyle(0x243044).fillRect(120, 208, 15, 10);
}
