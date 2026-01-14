const express = require('express');
const multer = require('multer');
const NodeID3 = require('node-id3');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Enable CORS
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadsDir = './uploads';
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir);
        }
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Process MP3 with artwork
app.post('/process-mp3', upload.fields([
    { name: 'mp3', maxCount: 1 },
    { name: 'image', maxCount: 1 }
]), async (req, res) => {
    try {
        const mp3File = req.files['mp3'][0];
        const imageFile = req.files['image'][0];
        const artistName = req.body.artist || '';
        const songTitle = req.body.title || '';
        const albumName = req.body.album || '';

        // Validate image format
        const supportedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (!supportedFormats.includes(imageFile.mimetype)) {
            throw new Error(`Unsupported image format: ${imageFile.mimetype}. Please use JPG, PNG, or GIF. HEIC is not supported for MP3 artwork.`);
        }

        // Read image file
        const imageBuffer = fs.readFileSync(imageFile.path);

        // Prepare ID3 tags
        const tags = {
            artist: artistName,
            title: songTitle,
            album: albumName,
            image: {
                mime: imageFile.mimetype,
                type: {
                    id: 3,
                    name: 'Front Cover'
                },
                description: 'Album Art',
                imageBuffer: imageBuffer
            }
        };

        // Create output filename
        const outputFilename = `${Date.now()}-modified.mp3`;
        const outputPath = path.join('./uploads', outputFilename);

        // Copy the original file first
        fs.copyFileSync(mp3File.path, outputPath);

        // Write ID3 tags to the copied file
        const success = NodeID3.write(tags, outputPath);

        if (success !== false) {
            // Read the modified file
            const modifiedFile = fs.readFileSync(outputPath);

            // Send the modified file
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', `attachment; filename="${songTitle || 'modified'}.mp3"`);
            res.send(modifiedFile);

            // Clean up temporary files after sending
            setTimeout(() => {
                try {
                    fs.unlinkSync(mp3File.path);
                    fs.unlinkSync(imageFile.path);
                    fs.unlinkSync(outputPath);
                } catch (err) {
                    console.error('Cleanup error:', err);
                }
            }, 1000);
        } else {
            throw new Error('Failed to write ID3 tags');
        }

    } catch (error) {
        console.error('Error processing MP3:', error);
        
        // Clean up files in case of error
        try {
            if (req.files['mp3']) fs.unlinkSync(req.files['mp3'][0].path);
            if (req.files['image']) fs.unlinkSync(req.files['image'][0].path);
        } catch (cleanupErr) {
            console.error('Cleanup error:', cleanupErr);
        }
        
        res.status(500).json({ error: 'Failed to process MP3: ' + error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Make sure to create a "public" folder and place index.html inside it');
});