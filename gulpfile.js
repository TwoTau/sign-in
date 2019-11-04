const gulp = require("gulp");
const browserify = require('browserify');
const source = require('vinyl-source-stream');
const sass = require("gulp-sass");
const gulpcache = require('gulp-cache');
const buffer = require('vinyl-buffer');
const htmlmin = require('gulp-htmlmin');
const terser = require('gulp-terser');
const sourcemaps = require('gulp-sourcemaps');

// task to generate the css with sass
gulp.task('scss', () => {
	return gulp.src('./src/scss/style.scss')
		.pipe(sass({
			outputStyle: 'compressed'
		})
			.on('error', sass.logError))
		.pipe(gulp.dest('./dist'))
		.pipe(gulpcache.clear());
});

gulp.task('html', () => {
	return gulp.src('./src/index.html')
		.pipe(htmlmin({
			collapseWhitespace: true,
			removeComments: true
		}))
		.pipe(gulp.dest('./dist'));
});

gulp.task('js', () => {
	const b = browserify({
		entries: ['./src/js/main.js', './src/js/jquery.auto-complete.min.js'],
	});

	return b.bundle()
		.pipe(source('main.js'))
		.pipe(buffer())
		// .pipe(sourcemaps.init({ loadMaps: true }))
		.pipe(terser())
		// .pipe(sourcemaps.write('./'))
		.pipe(gulp.dest('./dist'));
});

// watch for scss changes
gulp.task('watch', () => {
	gulp.series('html', 'js', 'scss');
	gulp.watch('./src/js/*.js', gulp.series('js'));
	gulp.watch('./src/index.html', gulp.series('html'));
	gulp.watch('./src/scss/*.scss', gulp.series('scss'));
});
