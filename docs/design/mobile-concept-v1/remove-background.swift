import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers
let args=CommandLine.arguments
let input=URL(fileURLWithPath:args[1]), output=URL(fileURLWithPath:args[2])
guard let source=CGImageSourceCreateWithURL(input as CFURL,nil),let image=CGImageSourceCreateImageAtIndex(source,0,nil) else {fatalError("Cannot read image")}
let handler=VNImageRequestHandler(cgImage:image,options:[:])
let request=VNGenerateForegroundInstanceMaskRequest()
try handler.perform([request])
guard let result=request.results?.first else {fatalError("No foreground mask")}
let mask=try result.generateScaledMaskForImage(forInstances:result.allInstances,from:handler)
let ci=CIImage(cgImage:image)
let filter=CIFilter(name:"CIBlendWithMask")!
filter.setValue(ci,forKey:kCIInputImageKey)
filter.setValue(CIImage(color:CIColor.clear).cropped(to:ci.extent),forKey:kCIInputBackgroundImageKey)
filter.setValue(CIImage(cvPixelBuffer:mask),forKey:kCIInputMaskImageKey)
let context=CIContext(options:[.useSoftwareRenderer:false])
try context.writePNGRepresentation(of:filter.outputImage!,to:output,format:.RGBA8,colorSpace:CGColorSpace(name:CGColorSpace.sRGB)!)
print("Saved \(output.lastPathComponent), instances \(result.allInstances.count)")
