import os
from PIL import Image, ImageDraw

def main():
    src_logo_path = "C:/Users/USER/.gemini/antigravity/brain/47f5544b-cb42-41f6-84e6-8e9a6bf08d9a/.user_uploaded/media_1786990093742.png"
    base_dir = "F:/FunProjects/Kotha Hobe"
    res_dir = os.path.join(base_dir, "frontend/android/app/src/main/res")
    public_dir = os.path.join(base_dir, "frontend/public")
    assets_dir = os.path.join(base_dir, "frontend/src/assets")

    os.makedirs(public_dir, exist_ok=True)
    os.makedirs(assets_dir, exist_ok=True)

    print("Loading exact user uploaded logo...")
    logo_img = Image.open(src_logo_path).convert("RGBA")

    # Save master logo to frontend public and src assets
    logo_img.save(os.path.join(public_dir, "logo.png"), "PNG")
    logo_img.save(os.path.join(assets_dir, "logo.png"), "PNG")
    print(f"Saved master logo to {public_dir}/logo.png and {assets_dir}/logo.png")

    densities = {
        "mipmap-mdpi": (48, 108),
        "mipmap-hdpi": (72, 162),
        "mipmap-xhdpi": (96, 216),
        "mipmap-xxhdpi": (144, 324),
        "mipmap-xxxhdpi": (192, 432),
    }

    # Circular mask for round icons
    def make_round(img_sq):
        s = img_sq.size[0]
        round_mask = Image.new('L', (s, s), 0)
        rm_draw = ImageDraw.Draw(round_mask)
        rm_draw.ellipse([0, 0, s, s], fill=255)
        round_img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
        round_img.paste(img_sq, (0, 0), round_mask)
        return round_img

    # Foreground generator with safe adaptive icon padding (66% of canvas)
    def make_foreground(fg_size):
        fg_canvas = Image.new('RGBA', (fg_size, fg_size), (0, 0, 0, 0))
        icon_dim = int(fg_size * 0.72)
        scaled_icon = logo_img.resize((icon_dim, icon_dim), Image.Resampling.LANCZOS)
        offset = (fg_size - icon_dim) // 2
        fg_canvas.paste(scaled_icon, (offset, offset), scaled_icon)
        return fg_canvas

    for folder, (icon_size, fg_size) in densities.items():
        folder_path = os.path.join(res_dir, folder)
        os.makedirs(folder_path, exist_ok=True)

        # 1. Standard ic_launcher.png
        icon = logo_img.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
        icon.save(os.path.join(folder_path, "ic_launcher.png"), "PNG")

        # 2. Round ic_launcher_round.png
        round_icon = make_round(icon)
        round_icon.save(os.path.join(folder_path, "ic_launcher_round.png"), "PNG")

        # 3. Adaptive ic_launcher_foreground.png
        fg = make_foreground(fg_size)
        fg.save(os.path.join(folder_path, "ic_launcher_foreground.png"), "PNG")

        print(f"Generated {folder}: {icon_size}x{icon_size}, round {icon_size}x{icon_size}, fg {fg_size}x{fg_size}")

    # Also update ic_launcher_background.xml to match the soft ivory background (#EDEAD9)
    bg_xml_path = os.path.join(res_dir, "values/ic_launcher_background.xml")
    with open(bg_xml_path, "w", encoding="utf-8") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#EDEAD9</color>\n</resources>\n')

    print("[SUCCESS] User logo and all Android launcher densities generated successfully!")

if __name__ == "__main__":
    main()
