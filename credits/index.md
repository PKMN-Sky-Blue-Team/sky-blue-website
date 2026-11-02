---
ref: credits
title: Credits
---
{%- include i18n.html -%}
<h1>{{ page.title }}</h1>

{% if site.data.credits.size > 0 %}
<dl class="credits">
{%- for person in site.data.credits %}
<div class="credits__entry">
<dt>{% if person.link %}<a href="{{ person.link }}">{{ person.name }}</a>{% else %}{{ person.name }}{% endif %}</dt>
<dd>{{ person.role }}</dd>
</div>
{%- endfor %}
</dl>
{% else %}
<p>{{ t.credits.empty }}</p>
{% endif %}
