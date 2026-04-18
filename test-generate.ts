import fs from 'fs';
import path from 'path';

async function test() {
  const formData = new FormData();
  
  // Create a dummy image
  const blob = new Blob(['dummy image data'], { type: 'image/png' });
  formData.append('template', blob, 'template.png');
  formData.append('data', JSON.stringify([{ name: 'John Doe' }]));
  formData.append('x', '0.5');
  formData.append('y', '0.5');
  formData.append('fontSize', '40');
  formData.append('color', '#000000');
  formData.append('nameColumn', 'name');

  try {
    const response = await fetch('http://localhost:3000/api/generate', {
      method: 'POST',
      body: formData,
    });
    
    const text = await response.text();
    console.log('Status:', response.status);
    console.log('Response:', text);
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

test();
