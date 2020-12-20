const { error } = require('firebase-functions/lib/logger');
const {db,admin} = require('../util/admin');
const config = require('../util/config');


exports.getAllFeeds = (req, res) => {
    db.collection('feeds').orderBy('createdAt','desc').get().then((data) =>{
        let feeds = [];
        data.forEach(doc =>{
            feeds.push({
                feedId: doc.id,
                body: doc.data().body,
                userHandle: doc.data().userHandle,
                createdAt: doc.data().createdAt,
                commentCount: doc.data().commentCount,
                likeCount: doc.data().likeCount,
                userImage: doc.data().userImage,
                feedImage: doc.data().feedImage,
            });
        });
        return res.json(feeds);
    })
    .catch((err) => {
        console.error(err);
        res.status(500).json({error:err.code});
    });
}

exports.postOneFeed = (req,res)=>{
    const BusBoy = require('busboy');
    const path = require('path');
    const os = require('os');
    const fs = require('fs');
    
    const busboy = new BusBoy({headers: req.headers});

    let imageFileName;
    let imageToBeUploaded = {};

    busboy.on('file',(fieldname,file, filename,encoding, mimetype) => {
        if(mimetype !== 'image/jpeg' && mimetype !== 'image/png'){
            return res.status(400).json({error: 'Wrong file type submitted'});
        }
        const imageExtension = filename.split('.')[filename.split('.').length - 1];
        imageFileName = `${Math.round(Math.random()*100000000000)}.${imageExtension}`;
        const filepath = path.join(os.tmpdir(), imageFileName);
        imageToBeUploaded = { filepath,mimetype};
        file.pipe(fs.createWriteStream(filepath));
    });

    busboy.on('field', function(fieldname,val){
        req.body = (fieldname,val);
    })

    busboy.on('finish',()=>{
        admin.storage().bucket().upload(imageToBeUploaded.filepath,{
            resumable: false,
            metadata:{
                metadata:{
                    contentType: imageToBeUploaded.mimetype
                }
            }
        })
        .then(()=>{
            const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
            console.log(imageUrl);         
            if(req.body.trim() === ''){
                 return res.status(400).json({body: 'Body must not be empty'});
            }
            const newFeed = {
                body: req.body,
                userHandle: req.user.handle,
                userImage: req.user.imageUrl,
                createdAt: new Date().toISOString(),
                likeCount: 0,
                commentCount: 0,
                feedImage: imageUrl
            };
            return db.collection('feeds').add(newFeed).then(doc=>{
                const resFeed = newFeed;
                resFeed.feedId = doc.id;
                res.json(resFeed);
            }).catch(err => {
                res.status(500).json({error: 'something went wrong'});
                console.error(err);
            });
        })
        .then(()=>{
            return res.json({message: 'Image uploaded successfully'});
        })
        .catch(err =>{
            console.error(err);
            return res.status(500).json({error:err.code});
        })
    });
    busboy.end(req.rawBody);
};


exports.getFeed = (req,res) =>{
    let feedData = {};
    db.doc(`/feeds/${req.params.feedId}`).get()
    .then(doc=>{
        if(!doc.exists){
            return res.status(404).json({error:'Feed not found'});
        }
        feedData = doc.data();
        feedData.feedId = doc.id;
        return db.collection('comments').orderBy('createdAt','desc').where('feedId','==',req.params.feedId).get();
    })
    .then(data=>{
        feedData.comments = [];
        data.forEach(doc=>{
            feedData.comments.push(doc.data())
        });
        return res.json(feedData);
    })
    .catch(err =>{
        console.error(err);
        res.status(500).json({error:err.code});
    })
}

exports.commentOnFeed = (req,res)=>{
    if(req.body.body.trim()==='') return res.status(400).json({comment:'Comment must not be empty'});
    
    const newComment = {
        body: req.body.body,
        createdAt: new Date().toISOString(),
        feedId: req.params.feedId,
        userHandle: req.user.handle,
        userImage: req.user.imageUrl
    };
    db.doc(`/feeds/${req.params.feedId}`).get()
    .then(doc=>{
        if(!doc.exists){
            return res.status(404).json({error:'Feed not found'});
        }
        return doc.ref.update({commentCount:doc.data().commentCount + 1});
    })
    .then(()=>{
        return db.collection('comments').add(newComment);
    })
    .then(()=>{
        res.json(newComment);

    })
    .catch(err =>{
        console.log(err);
        res.status(500).json({error:'Somthing went wrong'});
    })
}

exports.likeFeed = (req,res)=>{
    const likeDocument = db.collection('likes').where('userHandle','==',req.user.handle)
        .where('feedId','==',req.params.feedId).limit(1);

    const feedDocument = db.doc(`/feeds/${req.params.feedId}`);

    let feedData;

    feedDocument.get()
    .then(doc=>{
        if(doc.exists){
            feedData = doc.data();
            feedData.feedId = doc.id;
            return likeDocument.get();
        }else{
            return res.status(404).json({error:'Feed not found'});
        }
    })
    .then(data=>{
        if(data.empty){
            return db.collection('likes').add({
                feedId: req.params.feedId,
                userHandle: req.user.handle
            })
            .then(()=>{
                feedData.likeCount++;
                return feedDocument.update({likeCount: feedData.likeCount});
            })
            .then(()=>{
                return res.json(feedData);
            })
        } else{
            return res.status(400).json({error:'Feed already liked '})
        }
    })
    .catch(err =>{
        console.error(err);
        res.status(500).json({error:err.code});
    })
}

exports.unlikeFeed = (req,res)=>{
    const likeDocument = db.collection('likes').where('userHandle','==',req.user.handle)
        .where('feedId','==',req.params.feedId).limit(1);

    const feedDocument = db.doc(`/feeds/${req.params.feedId}`);

    let feedData;

    feedDocument.get()
    .then(doc=>{
        if(doc.exists){
            feedData = doc.data();
            feedData.feedId = doc.id;
            return likeDocument.get();
        }else{
            return res.status(404).json({error:'Feed not found'});
        }
    })
    .then(data=>{
        if(data.empty){
            return res.status(400).json({error:'Feed not liked '});            
        } else{
            return db.doc(`/likes/${data.docs[0].id}`).delete()
            .then(()=>{
                feedData.likeCount--;
                return feedDocument.update({likeCount: feedData.likeCount});
            })
            .then(()=>{
                res.json(feedData);
            })
        }
    })
    .catch(err =>{
        console.error(err);
        res.status(500).json({error:err.code});
    })
}

exports.deleteFeed = (req,res)=>{
    const document = db.doc(`/feeds/${req.params.feedId}`);
    document.get()
    .then(doc => {
        if(!doc.exists){
            return res.status(404).json({error:'Feed not found'});
        }
        if(doc.data().userHandle !== req.user.handle){
            return res.status(403).json({error:'Unauthorized'});
        }else{
            return document.delete();
        }
    })
    .then(()=>{
        res.json({message:'Feed deleted successfully'});
    })
    .catch(err=>{
        console.error(err);
        return res.status(500).json({error: err.code});
    })
}