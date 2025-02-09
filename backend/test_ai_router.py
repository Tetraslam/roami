import asyncio
import base64
import io
import os

from PIL import Image, ImageDraw, ImageFont
from routers.ai import get_cerebras_response, get_image_description
from dotenv import load_dotenv
load_dotenv()

def create_test_image() -> str:
    """Create a test image and return its base64 representation."""
    # Create a new image with a white background
    width = 300
    height = 200
    image = Image.new('RGB', (width, height), 'white')
    draw = ImageDraw.Draw(image)
    
    # Draw a simple scene
    # Sky (blue rectangle)
    draw.rectangle([0, 0, width, height//2], fill='skyblue')
    # Ground (green rectangle)
    draw.rectangle([0, height//2, width, height], fill='lightgreen')
    # House (red rectangle with brown door and yellow windows)
    house_left = width//3
    house_right = 2*width//3
    house_top = height//4
    house_bottom = 3*height//4
    # Main house
    draw.rectangle([house_left, house_top, house_right, house_bottom], fill='red')
    # Door
    door_width = (house_right - house_left)//4
    door_left = house_left + (house_right - house_left)//2 - door_width//2
    draw.rectangle([door_left, house_bottom-40, door_left+door_width, house_bottom], fill='brown')
    # Windows
    window_size = 20
    draw.rectangle([house_left+20, house_top+20, house_left+40, house_top+40], fill='yellow')
    draw.rectangle([house_right-40, house_top+20, house_right-20, house_top+40], fill='yellow')
    
    # Convert to base64
    buffer = io.BytesIO()
    image.save(buffer, format='JPEG')
    image_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    return image_base64

async def test_chat():
    """Test basic chat functionality."""
    print("\n=== Testing Chat ===\n")
    try:
        print("Sending chat request...")
        messages = [{"role": "user", "content": "What interesting places are near the Golden Gate Bridge?"}]
        async for chunk in get_cerebras_response(messages):
            print(f"Received chunk: {chunk}")
        print("✓ Chat test completed successfully\n")
        return True
    except Exception as e:
        print(f"❌ Chat test failed: {str(e)}\n")
        return False

async def test_image_analysis():
    """Test image analysis functionality."""
    print("=== Testing Image Analysis ===\n")
    success = True
    
    # Test with local test image
    try:
        print("Testing with local test image...")
        image_base64 = create_test_image()
        description = await get_image_description(image_base64, is_base64=True)
        print(f"Image description: {description}")
        
        # Check if description contains expected elements
        expected_elements = ['house', 'sky', 'green']
        found_elements = [elem for elem in expected_elements if elem.lower() in description.lower()]
        if found_elements:
            print(f"✓ Found expected elements in description: {', '.join(found_elements)}\n")
        else:
            print("⚠️ No expected elements found in description\n")
            success = False
            
    except Exception as e:
        print(f"❌ Test image analysis failed: {str(e)}\n")
        success = False

    # Test with invalid image data
    try:
        print("Testing with invalid image data...")
        await get_image_description("invalid_data", is_base64=True)
        print("❌ Should have failed with invalid data\n")
        success = False
    except Exception as e:
        print(f"✓ Successfully caught invalid data error: {str(e)}\n")

    return success

async def main():
    """Run all tests."""
    # Check for required API keys
    if not os.getenv("MOONDREAM_API_KEY"):
        print("⚠️ MOONDREAM_API_KEY not set")
        return
    if not os.getenv("CEREBRAS_API_KEY"):
        print("⚠️ CEREBRAS_API_KEY not set")
        return

    # Run tests
    chat_success = await test_chat()
    image_success = await test_image_analysis()
    
    # Print summary
    print("=== Test Summary ===")
    print(f"Chat Test: {'✓' if chat_success else '❌'}")
    print(f"Image Analysis Test: {'✓' if image_success else '❌'}\n")
    
    if chat_success and image_success:
        print("✓ All tests passed!")
    else:
        print("⚠️ Some tests failed")

if __name__ == "__main__":
    asyncio.run(main()) 