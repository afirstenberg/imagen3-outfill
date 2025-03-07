const sharp = require('sharp');
const { exec } = require('child_process');

const location = "us-central1";
const projectId = "your-project-id-here";
const model = "imagen-3.0-capability-001";

const dilation = 0.03;  // 0.03 is suggested
const baseSteps = 50;  // 35 is suggested start

const scale = 1.05;

const black = { r: 0, g: 0, b: 0, alpha: 1 };
const white = { r: 255, g: 255, b: 255, alpha: 1 };

let accessToken;

async function getAccessToken(){
  return accessToken ?? await loadAccessToken();
}

async function loadAccessToken(){
  const command = "gcloud auth print-access-token";
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${error}`);
        reject(error); // Reject the Promise with the error
        return;
      }
      if (stderr) {
        console.error(`Stderr from command: ${stderr}`);
      }
      accessToken = stdout.trim();
      resolve(accessToken);
    });
  });
}

/**
 * @param w - original width
 * @param h - original height
 * @param scale - How much to scale? (ie - 1.1 is "scale up 10%", 2.0 is "double")
 * @returns {{width: number, height: number, aspectRatio: number}}
 */
function newDimensions( w, h, scale ){
  const aspectRatio = w / h;
  const height = Math.round( h * scale );
  const width = Math.round( aspectRatio * height );

  return {
    width,
    height,
    aspectRatio,
  }
}

/**
 * @param width
 * @param height
 * @param color
 * @returns {Promise<*|sharp.Sharp>}
 */
async function solid( width, height, color ){
  return sharp({
    create: {
      width,
      height,
      background: color,
      channels: 4,
    }
  });
}

/**
 * Convert a sharp image object to a base64 representation of it
 * @param sharp
 * @returns {Promise<string>}
 */
async function sharp64( sharp ){
  const f = sharp.jpeg();
  const buffer = await f.toBuffer();
  return buffer.toString('base64');
}

async function callImagen( image, mask ){

  // Get the base64 version of the input files
  const image64 = await sharp64( image );
  const mask64 = await sharp64( mask );

  // Create the reference images for the request
  const imageRef = {
    referenceType: "REFERENCE_TYPE_RAW",
    referenceId: 1,
    referenceImage: {
      bytesBase64Encoded: image64,
    }
  };
  const maskRef = {
    referenceType: "REFERENCE_TYPE_MASK",
    referenceId: 2,
    referenceImage: {
      bytesBase64Encoded: mask64,
    },
    maskImageConfig: {
      maskMode: "MASK_MODE_USER_PROVIDED",
      dilation,
    }
  }

  // Create the request body
  const request = {
    instances: [
      {
        prompt: "",
        referenceImages: [
          imageRef,
          maskRef,
        ]
      }
    ],
    parameters: {
      editConfig: {
        baseSteps,
      },
      editMode: "EDIT_MODE_OUTPAINT",
      sampleCount: 1,
    }
  }

  // Make the call and get the response as JSON
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;
  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${await getAccessToken()}`,
  }
  const method = "POST";
  const body = JSON.stringify(request);
  const response = await fetch( url, {
    method,
    headers,
    body,
  });

  // Get the base64 bytes
  const responseData = await response.json();
  const response64 = responseData?.predictions?.[0]?.bytesBase64Encoded;

  if( !response64 ){
    console.error(responseData);
  }

  // Convert this to a sharp image object and return it
  const buffer = Buffer.from( response64, "base64" );
  return sharp( buffer );
}

/**
 *
 * @param inFileName - The initial file to load in
 * @param outFileName - The file to save to
 * @returns {Promise<void>}
 */
async function outcrop( inFileName, outFileName ){
  // Load the file
  console.log(`Loading ${inFileName}`);
  const inFile = sharp(inFileName);

  // Get the original file dimensions
  console.log('Getting dimensions')
  const inFileMetadata = await inFile.metadata();
  const inFileWidth = inFileMetadata.width;
  const inFileHeight = inFileMetadata.height;
  console.log(`inFile width=${inFileWidth} height=${inFileHeight}`);

  // Compute the larger file dimensions
  // We want to increase it by 10% while maintaining the aspect ratio
  const {width, height} = newDimensions( inFileWidth, inFileHeight, scale );
  console.log(`Working width=${width} height=${height}`);

  // Since we're doing centering, compute the X and Y offsets
  const offsetX = Math.round( (width - inFileWidth) / 2 );
  const offsetY = Math.round( (height - inFileHeight) / 2 );

  // Create the matted file
  // This is the file, in the original size,
  // centered over a black image in the new dimensions
  console.log('Create matte');
  const blackBackground = await solid( width, height, black );
  const matte = blackBackground.composite([{
    input: await inFile.toBuffer(),
    left: offsetX,
    top: offsetY,
  }]);

  // Create the mask file
  // This is a black file, in the original size,
  // centered over a white image in the new dimensions
  console.log('Create mask');
  const whiteBackground = await solid( width, height, white );
  const blackCenter = await solid( inFileWidth, inFileHeight, black );
  const wb64 = await sharp64(whiteBackground);
  const bc64 = await sharp64(blackCenter);
  const mask = whiteBackground.composite([{
    input: await blackCenter.toBuffer(),
    left: offsetX,
    top: offsetY,
  }]);

  // Call Imagen to make the new file
  console.log('Call Imagen');
  const newImage = await callImagen( matte, mask );
  const newImageMetadata = await newImage.metadata();

  // Scale the results to the initial dimensions
  console.log(`Scale image width ${newImageMetadata.width} -> ${inFileWidth}`);
  const scaledImage = newImage.resize({width: inFileWidth});

  // Save the results
  console.log(`Save to ${outFileName}`);
  await scaledImage.jpeg().toFile( outFileName );
}

function pad( num, digits ){
  return `${num}`.padStart( digits, '0' )
}

async function run(fileName, numIterations) {
  const maxPad = `${numIterations}`.length;
  for( let co=0; co<numIterations; co++ ){
    const inFileName = co ? `out-${pad(co, maxPad)}.jpg` : fileName;
    const outFileName = `out-${pad(co+1, maxPad)}.jpg`;
    console.log(`\n* Outcrop ${inFileName} -> ${outFileName}`);
    await outcrop( inFileName, outFileName );
  }

}

run( "brussels-1280-964.jpg", 100 );
