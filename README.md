# imagen3-outfill
Example of using the Imgaen 3 editing API on Google Cloud Vertex AI

This code was illustrated on 
[Two Voice Devs, episode 229](https://youtu.be/EocLmzOkAE4).

The code illustrates using outfill with Imagen 3 by 
1. Loading a photo
2. Creating an outfill mask around it
3. Using Imagen 3 to fill that area with a continuation of the image
4. Scaling the resulting image to the original image size
5. Repeating this

This code was designed to work with Node 20+

To use this:
* You may need to request access to the Imagen 3 editing API.
* Edit outfill.js to set your Google Cloud project ID.
* You may wish to edit the region to run this in (it defaults to us-central1).
* You can also fiddle with some of the settings, including the `dilation`
  and `baseSteps`. See the Imagen 3 editing documentation for details.
* How much outfill is created each step is controlled by the `scale`
  setting. 1.05 means to grow it by 5%. See the `newDimensions()`
  function for details.
* The filename to load and how many iterations to run are set on the last line.
