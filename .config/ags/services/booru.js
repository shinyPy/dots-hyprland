import Service from 'resource:///com/github/Aylur/ags/service.js';
import * as Utils from 'resource:///com/github/Aylur/ags/utils.js';

const APISERVICES = {
    'yandere': {
        name: 'yande.re',
        endpoint: 'https://yande.re/post.json',
    },
    'konachan': {
        name: 'Konachan',
        endpoint: 'https://konachan.net/post.json',
    },
};

const getWorkingImageSauce = (url) => {
    if (url.includes('pximg.net')) {
        return `https://www.pixiv.net/en/artworks/${url.substring(url.lastIndexOf('/') + 1).replace(/_p\d+\.png$/, '')}`;
    }
    return url;
};

function paramStringFromObj(params) {
    return Object.entries(params)
        .map(([key, value]) => {
            if (Array.isArray(value)) { // If it's an array, repeat
                if (value.length === 0) return '';
                return value.map(val => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`).join('&');
            }
            return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
        })
        .filter(param => param) // Remove empty parameters
        .join('&');
}

class BooruService extends Service {
    _baseUrl = 'https://konachan.net/post.json';
    _mode = 'konachan';
    _nsfw = userOptions.sidebar.image.allowNsfw;
    _responses = [];
    _queries = [];

    static {
        Service.register(this, {
            'initialized': [],
            'clear': [],
            'newResponse': ['int'],
            'updateResponse': ['int'],
        }, {
            'nsfw': ['boolean'],
        });
    }

    constructor() {
        super();
        this.emit('initialized');
    }

    clear() {
        this._responses = [];
        this._queries = [];
        this.emit('clear');
    }

    get nsfw() { return this._nsfw; }
    set nsfw(value) { this._nsfw = value; this.notify('nsfw'); }

    get mode() { return this._mode; }
    set mode(value) {
        if (APISERVICES[value]) {
            this._mode = value;
            this._baseUrl = APISERVICES[this._mode].endpoint;
        } else {
            throw new Error(`Invalid mode: ${value}`);
        }
    }
    get providerName() {
        return APISERVICES[this._mode].name;
    }
    get queries() { return this._queries; }
    get responses() { return this._responses; }

    async fetch(msg) {
        try {
            // Init
            const userArgs = `${msg}${(!this._nsfw || msg.includes('safe')) ? ' rating:safe' : ''}`.split(/\s+/);
            console.log('User Arguments:', userArgs);

            let taglist = [];
            let page = 1;
            // Construct body/headers
            for (let i = 0; i < userArgs.length; i++) {
                const thisArg = userArgs[i].trim();
                if (thisArg.length == 0 || thisArg == '.' || thisArg.includes('*')) continue;
                else if (!isNaN(thisArg)) page = parseInt(thisArg);
                else taglist.push(thisArg);
            }
            const newMessageId = this._queries.length;
            this._queries.push({
                providerName: APISERVICES[this._mode].name,
                taglist: taglist.length == 0 ? ['*', `${page}`] : [...taglist, `${page}`],
                realTagList: taglist,
                page: page,
            });
            this.emit('newResponse', newMessageId);
            const params = {
                'tags': taglist.join('+'),
                'page': `${page}`,
                'limit': `${userOptions.sidebar.image.batchCount}`,
            };
            const paramString = paramStringFromObj(params);
            // Fetch
            const options = {
                method: 'GET',
                headers: APISERVICES[this._mode].headers,
            };
            let status = 0;
            console.log('Fetching:', `${APISERVICES[this._mode].endpoint}?${paramString}`);

            const result = await Utils.fetch(`${APISERVICES[this._mode].endpoint}?${paramString}`, options);
            status = result.status;
            const dataString = await result.text();
            console.log('Fetch Result Status:', status);

            if (status !== 200) {
                throw new Error(`Failed to fetch data. Status code: ${status}`);
            }

            const parsedData = JSON.parse(dataString);
            console.log('Parsed Data:', parsedData);

            this._responses[newMessageId] = parsedData.map(obj => {
                return {
                    aspect_ratio: obj.width / obj.height,
                    id: obj.id,
                    tags: obj.tags,
                    md5: obj.md5,
                    preview_url: obj.preview_url,
                    preview_width: obj.preview_width,
                    preview_height: obj.preview_height,
                    sample_url: obj.sample_url,
                    sample_width: obj.sample_width,
                    sample_height: obj.sample_height,
                    file_url: obj.file_url,
                    file_ext: obj.file_ext,
                    file_width: obj.file_width,
                    file_height: obj.file_height,
                    source: getWorkingImageSauce(obj.source),
                }
            });
            this.emit('updateResponse', newMessageId);
        } catch (error) {
            console.error('Error in fetch:', error);
            this._responses[newMessageId] = [{ error: error.message }];
            this.emit('updateResponse', newMessageId);
        }
    }
}

export default new BooruService();
