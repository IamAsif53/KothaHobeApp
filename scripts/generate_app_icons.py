import os
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

def create_base_logo(size=1024):
    # Create image with RGBA
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Background Rounded Squircle with Emerald Gradient
    # Create high-res gradient background
    bg = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)

    # Draw gradient
    top_color = (11, 20, 26, 255)       # #0B141A dark teal background
    bottom_color = (6, 78, 59, 255)     # #064E3B deep emerald
    accent_emerald = (16, 185, 129, 255) # #10B981 vibrant emerald

    for y in range(size):
        factor = y / float(size)
        r = int(top_color[0] * (1 - factor) + bottom_color[0] * factor)
        g = int(top_color[1] * (1 - factor) + bottom_color[1] * factor)
        b = int(top_color[2] * (1 - factor) + bottom_color[2] * factor)
        bg_draw.line([(0, y), (size, y)], fill=(r, g, b, 255))

    # Mask with smooth rounded rectangle
    mask = Image.new('L', (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    corner_radius = int(size * 0.22)
    padding = int(size * 0.04)
    mask_draw.rounded_rectangle(
        [padding, padding, size - padding, size - padding],
        radius=corner_radius,
        fill=255
    )

    # Apply mask to background
    img.paste(bg, (0, 0), mask)

    # 2. Subtle Glow Border
    border_draw = ImageDraw.Draw(img)
    border_draw.rounded_rectangle(
        [padding, padding, size - padding, size - padding],
        radius=corner_radius,
        outline=(16, 185, 129, 90),
        width=int(size * 0.015)
    )

    # 3. Draw Stylized Chat Bubble & Voice Waves in Center
    center_x = size // 2
    center_y = int(size * 0.42)
    bubble_w = int(size * 0.48)
    bubble_h = int(size * 0.38)
    bubble_r = int(size * 0.12)

    bx1 = center_x - bubble_w // 2
    by1 = center_y - bubble_h // 2
    bx2 = center_x + bubble_w // 2
    by2 = center_y + bubble_h // 2

    # Draw Chat Bubble Glow
    glow_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)
    glow_draw.rounded_rectangle(
        [bx1 - 10, by1 - 10, bx2 + 10, by2 + 10],
        radius=bubble_r + 10,
        fill=(16, 185, 129, 60)
    )
    glow_img = glow_img.filter(ImageFilter.GaussianBlur(15))
    img.alpha_composite(glow_img)

    # Draw Chat Bubble Body
    bubble_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    bl_draw = ImageDraw.Draw(bubble_layer)
    bl_draw.rounded_rectangle(
        [bx1, by1, bx2, by2],
        radius=bubble_r,
        fill=(16, 185, 129, 255) # Emerald 500
    )

    # Bubble tail (bottom left)
    tail_pts = [
        (bx1 + int(bubble_w * 0.18), by2 - 4),
        (bx1 + int(bubble_w * 0.04), by2 + int(size * 0.07)),
        (bx1 + int(bubble_w * 0.38), by2 - 4)
    ]
    bl_draw.polygon(tail_pts, fill=(16, 185, 129, 255))
    img.alpha_composite(bubble_layer)

    # Draw Sound Wave / Speech Lines inside Bubble
    sw_draw = ImageDraw.Draw(img)
    bar_color = (255, 255, 255, 240)
    bars = [0.4, 0.75, 1.0, 0.65, 0.85, 0.45] # relative heights
    total_bars = len(bars)
    bar_width = int(size * 0.032)
    bar_gap = int(size * 0.022)
    total_w = total_bars * bar_width + (total_bars - 1) * bar_gap
    start_x = center_x - total_w // 2
    max_bar_h = int(bubble_h * 0.55)

    for i, h_ratio in enumerate(bars):
        bx = start_x + i * (bar_width + bar_gap)
        bh = int(max_bar_h * h_ratio)
        by_top = center_y - bh // 2
        by_bot = center_y + bh // 2
        sw_draw.rounded_rectangle(
            [bx, by_top, bx + bar_width, by_bot],
            radius=bar_width // 2,
            fill=bar_color
        )

    # 4. Render Bengali Text "কথা হবে" Below Bubble
    font_path = "C:/Windows/Fonts/Nirmala.ttc"
    font_size = int(size * 0.135)
    try:
        font = ImageFont.truetype(font_path, font_size)
    except Exception:
        font = ImageFont.load_default()

    text = "কথা হবে"
    text_layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    t_draw = ImageDraw.Draw(text_layer)

    # Measure text bounding box
    bbox = t_draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    tx = (size - tw) // 2
    ty = int(size * 0.73)

    # Text shadow / glow
    t_draw.text((tx, ty + 4), text, font=font, fill=(0, 0, 0, 160))
    t_draw.text((tx, ty), text, font=font, fill=(255, 255, 255, 255))
    img.alpha_composite(text_layer)

    return img

def create_foreground_icon(size=432):
    # For Android adaptive launcher icon foreground
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    base = create_base_logo(size=int(size * 0.82))
    offset = (size - base.width) // 2
    img.paste(base, (offset, offset), base)
    return img

def main():
    base_dir = "F:/FunProjects/Kotha Hobe"
    res_dir = os.path.join(base_dir, "frontend/android/app/src/main/res")
    public_dir = os.path.join(base_dir, "frontend/public")
    assets_dir = os.path.join(base_dir, "frontend/src/assets")

    os.makedirs(public_dir, exist_ok=True)
    os.makedirs(assets_dir, exist_ok=True)

    print("Generating master high-res logo...")
    logo_1024 = create_base_logo(1024)
    logo_1024.save(os.path.join(public_dir, "logo.png"), "PNG")
    logo_1024.save(os.path.join(assets_dir, "logo.png"), "PNG")
    print(f"Saved master logo to {public_dir}/logo.png")

    # Mipmap specifications (Launcher & Round)
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

    for folder, (icon_size, fg_size) in densities.items():
        folder_path = os.path.join(res_dir, folder)
        os.makedirs(folder_path, exist_ok=True)

        # Standard ic_launcher.png
        icon = logo_1024.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
        icon.save(os.path.join(folder_path, "ic_launcher.png"), "PNG")

        # Round ic_launcher_round.png
        round_icon = make_round(icon)
        round_icon.save(os.path.join(folder_path, "ic_launcher_round.png"), "PNG")

        # Adaptive ic_launcher_foreground.png
        fg = create_foreground_icon(fg_size)
        fg.save(os.path.join(folder_path, "ic_launcher_foreground.png"), "PNG")

        print(f"Generated {folder}: {icon_size}x{icon_size}, round {icon_size}x{icon_size}, fg {fg_size}x{fg_size}")

    print("[SUCCESS] All Android app launcher icons successfully generated!")

if __name__ == "__main__":
    main()
