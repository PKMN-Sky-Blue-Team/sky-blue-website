---
ref: faq
title: FAQ
---
{%- include i18n.html -%}
{%- assign faq = site.data.faq[lang] | default: site.data.faq[site.lang] -%}
<h1>{{ page.title }}</h1>

{% if faq.size > 0 %}
<div class="faq">
{%- for item in faq %}
<section class="faq__item" aria-labelledby="faq-{{ forloop.index }}">
<h2 id="faq-{{ forloop.index }}">{{ item.q }}</h2>
<div class="faq__answer">{{ item.a | markdownify }}</div>
</section>
{%- endfor %}
</div>
{% else %}
<p>{{ t.faq.empty }}</p>
{% endif %}
