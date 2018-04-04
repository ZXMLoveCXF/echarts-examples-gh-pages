var fs = require('fs');
var etpl = require('etpl');
var glob = require('glob');
var path = require('path');
var marked = require('marked');
var fm = require('front-matter');
var puppeteer = require('puppeteer');
var argparse = require('argparse');
var minimatch = require("minimatch");

var parser = new argparse.ArgumentParser({
    addHelp: true
});
parser.addArgument(['-s', '--source'], {
    help: 'Source folder'
});
parser.addArgument(['-t', '--theme'], {
    help: 'Theme list, default to be all'
});
parser.addArgument(['-p', '--pattern'], {
    help: 'Glob match patterns for generating thumb. https://github.com/isaacs/minimatch Mutiple match pattens can be splitted with ,'
});

var args = parser.parseArgs();
var sourceFolder = args.source || 'data';
var themeList = args.theme || 'default,light,dark';
var matchPattern = args.pattern;
if (matchPattern) {
    matchPattern = matchPattern.split(',');
}
themeList = themeList.split(',');

var tpl = fs.readFileSync('../public/javascripts/chart-list.tpl.js', 'utf-8');

etpl.config({
    commandOpen: '/**',
    commandClose: '*/'
});

function waitTime(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

var BUILD_THUMBS = sourceFolder === 'data' && true;
var BASE_URL = 'http://127.0.0.1/echarts-examples/public';

(async () => {
    // https://github.com/GoogleChrome/puppeteer/issues/1260
    if (BUILD_THUMBS) {
        var browser = await puppeteer.launch({
            headless: false,
            args: [
              '--headless',
              '--hide-scrollbars',
              '--mute-audio'
            ]
        });
    }

    // TODO puppeteer will have Navigation Timeout Exceeded: 30000ms exceeded error in these examples.
    var screenshotBlackList = [];

    var rootDir = __dirname + '/../';

    glob(`${rootDir}public/${sourceFolder}/*.js`, async function (err, files) {

        var exampleList = [];

        for (var fileName of files) {
            var baseDir = path.dirname(fileName);
            var basename = path.basename(fileName, '.js');

            var jsCode = fs.readFileSync(fileName, 'utf-8');

            // Remove mapbox temporary
            if (basename.indexOf('mapbox') >= 0
                || basename.indexOf('shanghai') >= 0
                || basename === 'lines3d-taxi-routes-of-cape-town'
                || basename === 'lines3d-taxi-chengdu'
                || basename === 'map3d-colorful-cities'
            ) {
                continue;
            }

            try {
                var mdText = fs.readFileSync(`${rootDir}public/${sourceFolder}/meta/${basename}.md`, 'utf-8');
                var fmResult = fm(mdText);
            }
            catch (e) {
                var fmResult = {
                    attributes: {}
                };
            }

            // var descHTML = marked(fmResult.body);

            // Do screenshot
            if (BUILD_THUMBS
                && screenshotBlackList.indexOf(basename) < 0
                && (!matchPattern || matchPattern.some(function (pattern) {
                    return minimatch(basename, pattern);
                }))
            ) {

                for (var theme of themeList) {
                    var thumbFolder = (theme !== 'default') ? ('thumb-' + theme) : 'thumb';
                    var page = await browser.newPage();
                    await page.setViewport({
                        // width: 600,
                        // height: 450
                        width: 700,
                        height: 525
                    });
                    var url = `${BASE_URL}/screenshot.html?c=${basename}&s=${sourceFolder}&t=${theme}`;
                    page.on('pageerror', function (err) {
                        console.log(err.toString());
                    });
                    // page.on('console', function (msg) {
                    //     console.log(msg.text);
                    // });
                    console.log(`Generating ${theme} thumbs.....${basename}`);
                    // https://stackoverflow.com/questions/46160929/puppeteer-wait-for-all-images-to-load-then-take-screenshot
                    try {
                        await page.goto(url, {'waitUntil' : 'networkidle0'});
                        await waitTime(200);
                        await page.screenshot({path: `${rootDir}public/${sourceFolder}/${thumbFolder}/${basename}.png` });
                    }
                    catch (e) {
                        console.error(e.toString());
                    }
                    await page.close();
                }
            }

            try {
                var difficulty = fmResult.attributes.difficulty != null ? fmResult.attributes.difficulty : 10;
                exampleList.push({
                    category: fmResult.attributes.category,
                    id: basename,
                    theme: fmResult.attributes.theme,
                    title: fmResult.attributes.title,
                    difficulty: +difficulty
                });
            }
            catch (e) {
                throw new Error(e.toString());
            }
        }

        if (BUILD_THUMBS) {
            await browser.close();
        }

        exampleList.sort(function (a, b) {
            if (a.difficulty === b.difficulty) {
                return a.id.localeCompare(b.id);
            }
            return a.difficulty - b.difficulty;
        });

        var code = 'var EXAMPLES' + (sourceFolder === 'data' ? ' = ' : '_GL = ') + JSON.stringify(exampleList, null, 2);
        fs.writeFileSync(`../public/javascripts/chart-list-${sourceFolder}.js`, code, 'utf-8');
    });
})()