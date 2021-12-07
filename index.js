const feature_unit = {
  'width': 'px',
  'height': 'px',
  'device-width': 'px',
  'device-height': 'px',
  'aspect-ratio': '',
  'device-aspect-ratio': '',
  'color': '',
  'color-index': '',
  'monochrome': '',
  'resolution': 'dpi'
};

// Supported min-/max- attributes
const feature_name = Object.keys(feature_unit);

const step = .001; // smallest even number that won’t break complex queries (1in = 96px)

const power = {
  '>': 1,
  '<': -1
};

const minmax = {
  '>': 'min',
  '<': 'max'
};

const mf_value_template = '-?\\d*\\.?(?:\\s*\\/?\\s*)?\\d+[a-z]*';

const mf_rule_single_template = '\\(\\s*([a-z-]+?)\\s*([<>])(=?)\\s*({value})\\s*\\)';

const mf_rule_double_template = '\\(\\s*({value})\\s*(<|>)(=?)\\s*([a-z-]+)\\s*(<|>)(=?)\\s*({value})\\s*\\)';

function create_query(name, gtlt, eq, value, { customValueRegExp, useCalc }) {
  if (customValueRegExp?.test(value)) {
    // if eq if false, then concatenate "+ 0.001" to the value
    if (!eq) {
      const op = (power[gtlt] < 0 ? ' - ' : ' + ');
      // use native CSS calc(), or leave calculations for the syntax processor
      value = useCalc
        ? 'calc(' + value + op + step + feature_unit[name] + ')'
        : value + op + step;
    }
    return '(' + minmax[gtlt] + '-' + name + ': ' + value + ')';
  }
  return value.replace(/([-\d\.]+)(.*)/, function (_match, number, unit) {
    const initialNumber = parseFloat(number);

    if (parseFloat(number) || eq) {
      // if eq is true, then number remains same
      if (!eq) {
        // change integer pixels value only on integer pixel
        if (unit === 'px' && initialNumber === parseInt(number, 10)) {
          number = initialNumber + power[gtlt];
        } else {
          number = Number(Math.round(parseFloat(number) + step * power[gtlt] + 'e6')+'e-6');
        }
      }
    } else {
      number = power[gtlt] + feature_unit[name];
    }

    return '(' + minmax[gtlt] + '-' + name + ': ' + number + unit + ')';
  });
}

/**
 * 
 * @param {Object} rule
 * @param {Object} opts
 * @returns
 */
function transform(rule, opts) {
  /**
   * 转换 <mf-name> <|>= <mf-value>
   *    $1  $2   $3
   * (width >= 300px) => (min-width: 300px)
   * (width <= 900px) => (max-width: 900px)
   */

  if (!rule.params.includes('<') && !rule.params.includes('>')) {
    return
  }

  // The value doesn't support negative values
  // But -0 is always equivalent to 0 in CSS, and so is also accepted as a valid <mq-boolean> value.

  rule.params = rule.params.replace(opts.ruleSingleRegExp, function($0, $1, $2, $3, $4) {
    if (feature_name.indexOf($1) > -1) {
      return create_query($1, $2, $3, $4, opts);
    }
    // If it is not the specified attribute, don't replace
    return $0;
  })

  /**
   * 转换  <mf-value> <|<= <mf-name> <|<= <mf-value>
   * 转换  <mf-value> >|>= <mf-name> >|>= <mf-value>
   *   $1  $2$3 $4  $5$6  $7
   * (500px <= width <= 1200px) => (min-width: 500px) and (max-width: 1200px)
   * (500px < width <= 1200px) => (min-width: 501px) and (max-width: 1200px)
   * (900px >= width >= 300px)  => (min-width: 300px) and (max-width: 900px)
   */

  rule.params = rule.params.replace(opts.ruleDoubleRegExp, function($0, $1, $2, $3, $4, $5, $6, $7) {

    if (feature_name.indexOf($4) > -1) {
      if ($2 === '<' && $5 === '<' || $2 === '>' && $5 === '>') {
        const min = ($2 === '<') ? $1 : $7;
        const max = ($2 === '<') ? $7 : $1;

        // output differently depended on expression direction
        // <mf-value> <|<= <mf-name> <|<= <mf-value>
        // or
        // <mf-value> >|>= <mf-name> >|>= <mf-value>
        let equals_for_min = $3;
        let equals_for_max = $6;

        if ($2 === '>') {
          equals_for_min = $6;
          equals_for_max = $3;
        }

        return create_query($4, '>', equals_for_min, min, opts) + ' and ' + create_query($4, '<', equals_for_max, max, opts);
      }
    }
    // If it is not the specified attribute, don't replace
    return $0;
  });
}

/**
 * @param {Object} [opts]
 * @param {string} [opts.customValueRegExp] - RegExp to match against non-standard syntax media query value.
 * @returns
 */
module.exports = (opts = {}) => {
  // Extract customValueRegExp body
  const customValueTemplate = opts.customValueRegExp?.toString().match(/\/(.*)\//)?.[1];
  // Concatenate standard value syntax with custom
  const valueTemplate = [mf_value_template, customValueTemplate]
    .filter(v => typeof v == 'string' && v != '')
    .map(template => `(?:${template})?`)
    .join('|');

  const transformOpts = {
    useCalc: opts.useCalc,
    customValueRegExp: opts.customValueRegExp,
    ruleSingleRegExp: new RegExp(mf_rule_single_template.replace(/{value}/g, valueTemplate), 'gi'),
    ruleDoubleRegExp: new RegExp(mf_rule_double_template.replace(/{value}/g, valueTemplate), 'gi'),
  };

  return {
    postcssPlugin: 'postcss-media-minmax',
    AtRule: {
      media: (atRule) => {
        transform(atRule, transformOpts)
      },
      'custom-media': (atRule) => {
        transform(atRule, transformOpts)
      },
    },
  }
};

module.exports.postcss = true
