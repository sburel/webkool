var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Webkool;
(function (Webkool) {
    'use strict';

    /*
    ** Template and Css Engine
    */
    var templateEngine = {
        'square': require('../lib/square'),
        'mustache': require('../lib/mustache')
    };

    var styleSheetEngine = {
        'css': '',
        'less': require('../lib/less'),
        'sass': require('../lib/sass')
    };

    /*
    **	require
    */
    var expat = require('node-expat');
    var sbuff = require('stream-buffers');
    var fs = require('fs');

    var outputJS, outputCSS, options = {
        client: false,
        server: false,
        target: {},
        includes: [__dirname + '/../lib/client/', './'],
        inputs: [],
        output: ''
    };

    var SideType;
    (function (SideType) {
        SideType[SideType["BOTH"] = 0] = "BOTH";
        SideType[SideType["SERVER"] = 1] = "SERVER";
        SideType[SideType["CLIENT"] = 2] = "CLIENT";
    })(SideType || (SideType = {}));
    ;

    /*
    **	BufferManager
    */
    var BufferManager = (function () {
        function BufferManager() {
            this.buffers = [];
        }
        BufferManager.prototype.newBuffer = function (neededSide, name) {
            this.buffers.push({
                'name': name,
                'side': neededSide,
                'data': ""
            });
        };

        BufferManager.prototype.get = function (side, name, create) {
            for (var i = 0; i < this.buffers.length; i++) {
                if (this.buffers[i].name == name && this.buffers[i].side == side)
                    return (this.buffers[i]);
            }
            if (create) {
                this.newBuffer(side, name);
                return (this.get(side, name, false));
            }
            return (undefined);
        };

        BufferManager.prototype.write = function (side, name, data) {
            this.get(side, name, true).data += data;
        };

        BufferManager.prototype.getBuffers = function () {
            return (this.buffers);
        };

        BufferManager.prototype.exec = function (side, name, callback) {
            callback(this.get(side, name, false));
        };

        BufferManager.prototype.copy = function (other) {
            this.buffers = other.getBuffers();
        };

        BufferManager.prototype.merge = function (side, other) {
            if (side == SideType.BOTH) {
                this.merge(SideType.SERVER, other);
                this.merge(SideType.CLIENT, other);
            } else {
                var buff = other.getBuffers();

                for (var i = 0; i < buff.length; i++) {
                    if (side == buff[i].side || buff[i].side == SideType.BOTH)
                        this.write(side, buff[i].name, buff[i].data);
                }
            }
        };

        BufferManager.prototype.dump = function () {
            console.log('##################################');
            for (var i = 0; i < this.buffers.length; i++) {
                console.log('[' + this.buffers[i].name + '][' + this.buffers[i].side + '] = ' + this.buffers[i].data);
                console.log('------------------------------');
            }
            console.log('##################################\n');
        };
        return BufferManager;
    })();

    /*
    **	Nodes
    */
    var Element = (function () {
        function Element(parser, name, attrs) {
            this.start(parser, name, attrs);
        }
        Element.prototype.start = function (parser, name, attrs) {
            if (parser.currentElement) {
                parser.currentElement.processText(parser);
                parser.currentElement.children.push(this);
            }
            this.parent = parser.currentElement;
            this.children = [];
            this.name = name;
            this.attrs = attrs;
            this.text = '';
            parser.currentElement = this;
        };

        Element.prototype.stop = function (parser, name) {
            this.processText(parser);
            parser.currentElement = this.parent;
        };

        Element.prototype.prepare = function (parser) {
            this.children.forEach(function (item) {
                item.prepare(parser);
            });
        };

        Element.prototype.processElement = function (parser, name, attrs) {
            if (this.elementRules.hasOwnProperty(name))
                return new (this.elementRules[name])(parser, name, attrs);
            parser.error('Element not found <' + name + '>');
        };

        Element.prototype.processText = function (parser) {
            this.text += parser.currentText;
            parser.currentText = '';
        };

        Element.prototype.print = function (buffers, side) {
            this.printHeader(buffers, side);
            this.printBody(buffers, side);
            this.printFooter(buffers, side);
        };

        Element.prototype.printHeader = function (buffers, side) {
            return;
        };

        Element.prototype.printBody = function (buffers, side) {
            this.children.forEach(function (item) {
                item.print(buffers, side);
            });
        };

        Element.prototype.printFooter = function (buffers, side) {
            return;
        };
        return Element;
    })();

    var Include = (function (_super) {
        __extends(Include, _super);
        function Include(parser, name, attrs) {
            _super.call(this, parser, name, attrs);
            this.elementRules = {};
            this.name = 'include';
            this.parser = parser;
            this.preparedBuffers = new BufferManager();
        }
        Include.prototype.prepare = function (parser) {
            var element = this;
            var filename = getPath(this.attrs.href);
            var extension = '.' + filename.split('.').pop();

            console.log('# including ' + this.attrs.href);
            if (!filename) {
                console.log('// include ' + this.attrs.href + ' not found!');
            } else {
                if (extension == '.wk') {
                    parser.wait(this);
                    doParseDocument(filename, function (buffers) {
                        element.preparedBuffers.copy(buffers);
                        parser.dequeue(element);
                    });
                } else {
                    parser.wait(this);
                    fs.readFile(filename, function (err, data) {
                        element.preparedBuffers.write(SideType.BOTH, extension, '/* include ' + element.attrs.href + '*/\n');
                        element.preparedBuffers.write(SideType.BOTH, extension, data);
                        parser.dequeue(element);
                    });
                }
            }
        };

        Include.prototype.printBody = function (buffers, side) {
            buffers.merge(side, this.preparedBuffers);
        };
        return Include;
    })(Element);

    var On = (function (_super) {
        __extends(On, _super);
        function On(parser, name, attrs) {
            _super.call(this, parser, name, attrs);
            this.elementRules = {};
            this.name = 'on';
        }
        On.prototype.printBody = function (buffers, side) {
            buffers.write(side, '.js', 'on_');
            buffers.write(side, '.js', this.attrs.id);
            buffers.write(side, '.js', ': { value: function(context, model, query, result) {');
            buffers.write(side, '.js', this.text);
            buffers.write(side, '.js', '}},\n');
        };
        return On;
    })(Element);

    var Property = (function (_super) {
        __extends(Property, _super);
        function Property(parser, name, attrs) {
            _super.call(this, parser, name, attrs);
            this.elementRules = {};
            this.name = 'property';
        }
        Property.prototype.printBody = function (buffers, side) {
            if (!this.attrs.hasOwnProperty('id'))
                throw new Error('properties must have an id!');
            buffers.write(side, '.js', 'application.addProperty(\"');
            buffers.write(side, '.js', this.attrs.id);
            buffers.write(side, '.js', '\", \"');
            buffers.write(side, '.js', this.text);
            buffers.write(side, '.js', '\");\n');
        };
        return Property;
    })(Element);

    var Script = (function (_super) {
        __extends(Script, _super);
        function Script(parser, name, attrs) {
            _super.call(this, parser, name, attrs);
            this.elementRules = {};
            this.name = 'script';
        }
        Script.prototype.printBody = function (buffers, side) {
            buffers.write(side, '.js', this.text);
            buffers.write(side, '.js', '\n');
        };
        return Script;
    })(Element);

    var Stylesheet = (function (_super) {
        __extends(Stylesheet, _super);
        function Stylesheet(parser, name, attrs) {
            _super.call(this, parser, name, attrs);
            this.elementRules = {};
            this.name = 'stylesheet';
            this.type = 'css';
            if (this.attrs.hasOwnProperty('type') && styleSheetEngine.hasOwnProperty(this.attrs.type))
                this.type = this.attrs.type;
        }
        //styleSheetEngine[this.type].compile(this.text, css);
        Stylesheet.prototype.print = function (buffers, side) {
            buffers.write(side, '.' + this.type, this.text);
        };
        return Stylesheet;
    })(Element);

    var Template = (function (_super) {
        __extends(Template, _super);
        function Template(parser, name, attrs) {
            _super.call(this, parser, name, attrs);
            this.elementRules = {};
            this.name = 'template';
            this.templateName = 'square';
            if (this.attrs.hasOwnProperty('system') && templateEngine.hasOwnProperty(this.attrs.system))
                this.templateName = this.attrs.system;
        }
        Template.prototype.printHeader = function (buffers, side) {
            if (this.attrs.hasOwnProperty('id')) {
                if (Handler.prototype.isPrototypeOf(this.parent))
                    throw new Error('Embedded templates have no id!');
                buffers.write(side, '.js', 'application.addTemplate(\"');
                buffers.write(side, '.js', this.attrs.id);
                buffers.write(side, '.js', '\", Object.create(Template.prototype, {\n');
            } else {
                if (!Handler.prototype.isPrototypeOf(this.parent))
                    throw new Error('Stand-alone templates must have an id!');
            }
        };

        Template.prototype.printBody = function (buffers, side) {
            buffers.write(side, '.js', 'on_render');
            buffers.write(side, '.js', ': { value:\n');

            var cleaned = this.text.replace(/\s+/g, ' ');
            cleaned = cleaned.replace(/\"/g, '\\\"');

            var bufferString = new Buffer(cleaned);
            var streamBuff = new sbuff.WritableStreamBuffer();

            var templateCompiler = new templateEngine[this.templateName].parse(bufferString);
            templateCompiler.print(streamBuff, '');

            buffers.write(side, '.js', streamBuff.getContentsAsString("utf8"));
            buffers.write(side, '.js', '},\n');
        };

        Template.prototype.printFooter = function (buffers, side) {
            if (this.attrs.hasOwnProperty('id')) {
                buffers.write(side, '.js', '\n}));\n\n');
            }
        };
        return Template;
    })(Element);

    var Client = (function (_super) {
        __extends(Client, _super);
        function Client(parser, name, attrs) {
            _super.call(this, parser, name, attrs);
            this.elementRules = {
                handler: Handler,
                include: Include,
                on: On,
                property: Property,
                script: Script,
                stylesheet: Stylesheet,
                template: Template
            };
            this.name = 'client';
        }
        Client.prototype.print = function (buffers, side) {
            if (options.client || (!options.client && !options.server))
                Element.prototype.print.call(this, buffers, SideType.CLIENT);
        };
        return Client;
    })(Element);

    var Handler = (function (_super) {
        __extends(Handler, _super);
        function Handler(parser, name, attrs) {
            _super.call(this, parser, name, attrs);
            this.elementRules = {
                on: On,
                bind: Bind,
                template: Template
            };
            this.name = 'handler';
        }
        Handler.prototype.printHeader = function (buffers, side) {
            buffers.write(side, '.js', 'application.addHandler(\"');
            buffers.write(side, '.js', this.attrs.url);
            buffers.write(side, '.js', '\", Object.create(Handler.prototype, {\n');
            buffers.write(side, '.js', 'url : { value: \"');
            buffers.write(side, '.js', this.attrs.url);
            buffers.write(side, '.js', '\"},\n');
            if (this.attrs.type) {
                buffers.write(side, '.js', 'contentType : { value: \"');
                buffers.write(side, '.js', this.attrs.type);
                buffers.write(side, '.js', '\"},\n');
            }
        };

        Handler.prototype.printFooter = function (buffers, side) {
            buffers.write(side, '.js', '\n}));\n\n');
        };
        return Handler;
    })(Element);

    var Bind = (function (_super) {
        __extends(Bind, _super);
        function Bind(parser, name, attrs) {
            _super.call(this, parser, name, attrs);
            this.elementRules = {};
            this.name = 'bind';
        }
        Bind.prototype.printBody = function (buffers, side) {
            buffers.write(side, '.js', 'application.addObserver(' + this.attrs.data + ', ' + this.attrs.with + ');\n');
        };
        return Bind;
    })(Element);

    var Server = (function (_super) {
        __extends(Server, _super);
        function Server(parser, name, attrs) {
            _super.call(this, parser, name, attrs);
            this.elementRules = {
                handler: Handler,
                include: Include,
                on: On,
                property: Property,
                script: Script,
                stylesheet: Stylesheet,
                template: Template
            };
            this.name = 'server';
        }
        Server.prototype.print = function (buffers, side) {
            if (options.server || (!options.client && !options.server))
                Element.prototype.print.call(this, buffers, SideType.SERVER);
        };
        return Server;
    })(Element);

    var Application = (function (_super) {
        __extends(Application, _super);
        function Application(parser, name, attrs) {
            _super.call(this, parser, name, attrs);
            this.elementRules = {
                client: Client,
                handler: Handler,
                include: Include,
                property: Property,
                server: Server,
                script: Script,
                stylesheet: Stylesheet,
                template: Template
            };
            this.name = 'application';
        }
        return Application;
    })(Element);

    var Roots = (function (_super) {
        __extends(Roots, _super);
        function Roots(parser, name, attrs) {
            _super.call(this, parser, name, attrs);
            this.elementRules = {
                application: Application
            };
            this.name = 'roots';
        }
        return Roots;
    })(Element);

    /*
    ** Parse Arguments
    */
    function doParseArguments(options) {
        var argv = require('optimist').alias('c', 'client').alias('s', 'server').boolean(['server', 'client']).string('o', 'i').describe('c', 'compile for client').describe('s', 'compile for server').describe('i', 'include directory').describe('o', 'output basename').usage('$0').demand('_').argv;

        options.server = argv.server;
        options.client = argv.client;

        if (argv.i) {
            if (argv.i instanceof Array)
                argv.i.forEach(function (elm) {
                    options.includes.push(elm);
                });
else
                options.includes.push(argv.i);
        }

        if (argv.o)
            options.output = (argv.o instanceof Array) ? (argv.o.splice(-1)) : (argv.o);

        argv._.forEach(function (elm) {
            options.inputs.push(elm);
        });
    }

    /*
    ** parsing entry point and utils
    */
    function doNextDocument() {
        if (options.inputs.length) {
            doParseDocument(options.inputs.shift(), doNextDocument);
        }
    }

    function doParseDocument(filename, callback) {
        var parser = new expat.Parser('UTF-8');
        parser.currentElement = null;
        parser.currentText = '';

        parser.roots = new Roots(parser, 'roots', null);

        parser.filename = filename;
        parser.elements = [parser];
        parser.wait = function (element) {
            this.elements.push(element);
        };
        parser.dequeue = function (element) {
            var index = this.elements.indexOf(element);
            if (index < 0)
                console.log('>>>> DEQUEUE UNKNOWN ELEMENT');
            this.elements.splice(index, 1);
            if (this.elements.length == 0) {
                var buffers = new BufferManager();
                this.currentElement.print(buffers, SideType.BOTH);
                if (callback)
                    callback(buffers);
            }
        };
        parser.error = function (e) {
            console.log(parser.filename + ':' + parser.getCurrentLineNumber() + ': error:' + e);
        };
        parser.addListener('error', function (e) {
            console.log(parser.filename + ':' + parser.getCurrentLineNumber() + ': error:' + e);
        });
        parser.addListener('startElement', function (name, attrs) {
            this.currentElement.processElement(parser, name, attrs);
        });
        parser.addListener('endElement', function (name) {
            this.currentElement.stop(parser, name);
        });
        parser.addListener('text', function (s) {
            this.currentText += s;
        });
        parser.addListener('end', function () {
            this.currentElement.prepare(parser);
            parser.dequeue(parser);
        });
        console.log('# parsing ' + parser.filename);
        parser.input = fs.createReadStream(parser.filename);
        parser.input.pipe(parser);
    }

    function getPath(filename) {
        var i, c = options.includes.length, path, folder;
        for (i = 0; i < c; i += 1) {
            folder = options.includes[i];
            try  {
                path = makePath(folder, filename);
                if (path) {
                    return path;
                }
            } catch (unused) {
                continue;
            }
        }
    }

    function makePath(rootpath, filename) {
        var length = rootpath.length, path = filename;
        if (length) {
            if (rootpath.charAt(length - 1) != '/') {
                path = rootpath + '/' + filename;
            } else {
                path = rootpath + filename;
            }
        }
        return fs.realpathSync(path);
    }

    function checkWebKoolWkFileExistence() {
        try  {
            var path = fs.realpathSync('./.webkool.wk');
        } catch (e) {
            var data = fs.readFileSync(__dirname + '/../sources/templates/webkool.wk');
            fs.writeFileSync('./.webkool.wk', data);
        }
    }

    function createFilesForSide(side, buffers, name) {
        if (side == SideType.BOTH) {
            createFilesForSide(SideType.SERVER, buffers, ((name.length == 0) ? ('') : (name + '.')) + 'server');
            createFilesForSide(SideType.CLIENT, buffers, ((name.length == 0) ? ('') : (name + '.')) + 'client');
        } else {
            var buff = buffers.getBuffers();
            for (var i = 0; i < buff.length; i++) {
                console.log('[', buff[i].side, '] = ', buff[i].name);
                if (buff[i].side == side && (buff[i].name == '.js' || buff[i].name == '.css')) {
                    var fileName = name + buff[i].name;
                    var outputStream = fs.createWriteStream(fileName);

                    console.log('#saving in file ' + name);
                    outputStream.write(buff[i].data);
                }
            }
        }
    }

    function joinBuffers(side, buffers) {
        if (side == SideType.BOTH) {
            joinBuffers(SideType.SERVER, buffers);
            joinBuffers(SideType.CLIENT, buffers);
        } else {
            for (var eng in styleSheetEngine) {
                if (eng != 'css')
                    var engBuffer = buffers.get(side, '.' + eng, false);
                if (engBuffer) {
                    var streamBuff = new sbuff.WritableStreamBuffer();

                    styleSheetEngine[eng].compile(engBuffer.data, streamBuff);
                    buffers.write(side, '.css', streamBuff.getContentsAsString("utf8"));
                }
            }

            if (side == SideType.SERVER)
                var js = buffers.write(SideType.SERVER, '.js', '\napplication.start()\n');
        }
    }

    function run() {
        //feed the option object with the command line;
        doParseArguments(options);

        //create a .webkool.wk file if it doesn't exist.
        checkWebKoolWkFileExistence();

        //begin the parsing of .webkool.wk
        doParseDocument('.webkool.wk', function (initialBuffers) {
            var _buffers = initialBuffers;

            //parse the entry point (index.wk for example)
            doParseDocument(options.inputs.shift(), function (buffers) {
                //merge buffers created by .webkool.wk and the entry point
                _buffers.merge(SideType.BOTH, buffers);

                //process some operation over buffer
                joinBuffers(SideType.BOTH, _buffers);

                if (options.client)
                    createFilesForSide(SideType.CLIENT, _buffers, (options.output.length == 0 ? 'client' : options.output));
                if (options.server)
                    createFilesForSide(SideType.SERVER, _buffers, (options.output.length == 0 ? 'server' : options.output));
                if ((options.server && options.client) || (!options.server && !options.client))
                    createFilesForSide(SideType.BOTH, _buffers, options.output);
            });
        });
    }
    Webkool.run = run;
})(Webkool || (Webkool = {}));

Webkool.run();