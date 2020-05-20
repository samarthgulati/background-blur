let texture, mask, iChannel0Location, u_maskLocation, positionBuffer, positionBufferData;
let w, h;
const canvas = document.querySelector(`#canvas`);
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const gl = canvas.getContext("webgl", {
  antialias: true
});
// shader string to gl property
function createShader(gl, type, source) {
	var shader = gl.createShader(type);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
	if (success) {
		return shader;
	}

	console.log(gl.getShaderInfoLog(shader));
	gl.deleteShader(shader);
}

// return a shader program that links the two shaders
function createProgram(gl, vertexShader, fragmentShader) {
	var program = gl.createProgram();
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	var success = gl.getProgramParameter(program, gl.LINK_STATUS);
	if (success) {
		return program;
	}

	console.log(gl.getProgramInfoLog(program));
	gl.deleteProgram(program);
}

var VERTEX_SHADER_SOURCE = /* GLSL */ `
attribute vec4 a_position;
void main() {
  gl_Position = a_position;
}
`;

var FRAGMENT_SHADER_SOURCE = /* GLSL */ `
// fragment shaders don't have a default precision so we need
// to pick one. mediump is a good default
precision mediump float;

uniform vec2 iResolution;
// The texture.
uniform sampler2D u_mask;
uniform sampler2D iChannel0;
// https://www.shadertoy.com/view/XdfGDH
float normpdf(in float x, in float sigma) {
	return 0.39894*exp(-0.5*x*x/(sigma*sigma))/sigma;
}
void blur( out vec3 color, in vec2 fragCoord, in sampler2D tex, in float multiplier ) {
  const int mSize = 11; // default 11
  const int kSize = (mSize-1)/2;
  float kernel[mSize];
  vec3 final_colour = vec3(0.0);
  
  //create the 1-D kernel
  float sigma = 7.0;
  float Z = 0.0;
  for (int j = 0; j <= kSize; ++j) {
    kernel[kSize+j] = kernel[kSize-j] = normpdf(float(j), sigma);
  }
  
  //get the normalization factor (as the gaussian has been clamped)
  for (int j = 0; j < mSize; ++j) {
    Z += kernel[j];
  }
  
  //read out the texels
  for (int i=-kSize; i <= kSize; ++i) {
    for (int j=-kSize; j <= kSize; ++j) {
      final_colour += kernel[kSize+j]*kernel[kSize+i] * texture2D(tex, (gl_FragCoord.xy+vec2(float(i),float(j))) / iResolution.xy).rgb * multiplier;
    }
  }
  color = final_colour/(Z*Z);
}
void main() {
  vec2 uv = gl_FragCoord.xy / iResolution;
  vec3 mask;
  blur(mask, gl_FragCoord.xy, u_mask, 255.0);
  vec3 video;
  blur(video, gl_FragCoord.xy, iChannel0, 1.0);
  gl_FragColor = (vec4(video, 1.0) * (1.0 - mask.r)) + 
                 (texture2D(iChannel0, uv) * mask.r);
}
`;

async function render() {
  requestAnimationFrame(render);
  const segmentation = await bodypixNet.segmentPerson(webcam)
  console.log(segmentation.data.length)
  
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, webcam);

	gl.bindTexture(gl.TEXTURE_2D, mask);
	gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE,
    new Uint8Array(segmentation.data)
  );
  gl.bindTexture(gl.TEXTURE_2D, null);

	// set which texture units to render with.
	gl.uniform1i(iChannel0Location, 0); // texture unit 0
	gl.uniform1i(u_maskLocation, 1); // texture unit 1

	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, texture);
	gl.activeTexture(gl.TEXTURE1);
	gl.bindTexture(gl.TEXTURE_2D, mask);

	gl.clearColor(0, 0, 0, 0);
	gl.clear(gl.COLOR_BUFFER_BIT);

  
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positionBufferData), gl.STATIC_DRAW);

	gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function setup() {
  positionBufferData = [
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1,
  ];
	var vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
	var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
	var program = createProgram(gl, vertexShader, fragmentShader);

	var resolutionUniformLocation = gl.getUniformLocation(program, "iResolution");
	iChannel0Location = gl.getUniformLocation(program, "iChannel0");
	u_maskLocation = gl.getUniformLocation(program, "u_mask");
	
	var positionAttributeLocation = gl.getAttribLocation(program, "a_position");

	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	
	gl.clearColor(0, 0, 0, 0);
	gl.clear(gl.COLOR_BUFFER_BIT);
	
	gl.useProgram(program);
	
	gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);

	texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
	
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 255, 255])
  );


	mask = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, mask);
	var maskData = [...Array(w * h)].fill(0);

	gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE,
    new Uint8Array(maskData)
  );
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	positionBuffer = gl.createBuffer();
	
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.enableVertexAttribArray(positionAttributeLocation);

  gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
  render();
}

async function main() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: false
  });
  console.log('webcam stream started');
  webcam.srcObject = stream;
  await new Promise(res => {
    webcam.onloadedmetadata = function() {
      console.log('webcam stream loaded');
      w = webcam.videoWidth;
      h = webcam.videoHeight;
      res({w, h})
    }
  });
  webcam.height = h;
  webcam.width = w;
  canvas.height = h;
  canvas.width = w;
  webcam.setAttribute('autoplay', true);
  webcam.setAttribute('muted', true);
  webcam.setAttribute('playsinline', true);
  console.log('webcam stream playing');
  webcam.play();
  bodypixNet = await bodyPix.load({
    architecture: 'MobileNetV1',
    outputStride: 16,
    multiplier: 0.75,
    quantBytes: 2
  });
  console.log('bodypix loaded');
  setup();
}

main();