import io
from PIL import Image
import pillow_heif

def convert_heic_to_jpg(file_stream):
    """
    Converts a HEIC/HEIF file stream to a JPEG in memory.
    
    Args:
        file_stream: The uploaded file object (e.g., from request.files['file']).
        
    Returns:
        io.BytesIO: A file-like buffer containing the converted JPEG data.
    """
    try:
        # Read the raw HEIC file bytes
        file_bytes = file_stream.read()
        
        # Parse the HEIC image using pillow_heif
        heif_file = pillow_heif.read_heif(file_bytes)
        
        # Convert to a standard PIL Image
        image = Image.frombytes(
            heif_file.mode, 
            heif_file.size, 
            heif_file.data,
            "raw"
        )
        
        # JPEGs do not support transparency. If the image has an alpha channel, 
        # blend it with a white background.
        if image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info):
            background = Image.new('RGB', image.size, (255, 255, 255))
            # The paste method uses the alpha channel as a mask
            if image.mode == 'RGBA':
                background.paste(image, mask=image.split()[3])
            else:
                background.paste(image)
            image = background
        elif image.mode != 'RGB':
            image = image.convert('RGB')
            
        # Create an in-memory buffer to hold the final JPEG
        jpeg_buffer = io.BytesIO()
        
        # Save as JPEG with high quality and optimization
        image.save(jpeg_buffer, format="JPEG", quality=85, optimize=True)
        
        # Reset the buffer's pointer to the beginning so Cloudinary/Flask can read it
        jpeg_buffer.seek(0)
        
        return jpeg_buffer
        
    except Exception as e:
        print(f"Error converting HEIC to JPG: {e}")
        return None